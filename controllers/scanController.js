const path            = require('path')
const { v4: uuidv4 }  = require('uuid')
const Scan            = require('../models/Scan')
const mlService       = require('../services/mlService')
const analysisService = require('../services/analysisService')
const pdfService      = require('../services/pdfService')
const { uploadMRI, deleteMRI, uploadGradCAM, deleteGradCAM } = require('../services/storageService')
const axios = require('axios')   
// ── POST /api/scans
// The frontend then calls POST /api/scans/analyse with the returned scanId
async function uploadScan(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'No file uploaded.' })
    }

    const { hasPatient, fullName, age, gender, patientId, notes, gradCamEnabled, reportEnabled } = req.body
    // uploading the scan in Supabase Storage
    const { storagePath, publicUrl } = await uploadMRI(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    )
    // verifying whether user has entered patient's info
    const includePatient = hasPatient === 'true'

    if (includePatient) {
      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ status: 'fail', message: 'Patient full name is required.' })
      }
      if (!age || isNaN(Number(age))) {
        return res.status(400).json({ status: 'fail', message: 'Patient age is required.' })
      }
      if (!gender) {
        return res.status(400).json({ status: 'fail', message: 'Patient gender is required.' })
      }
    }
    // creating the scan object in MongoDB
    const scan = await Scan.create({
      userId:   req.user._id,
      scanId:   'SC-' + uuidv4().split('-')[0].toUpperCase(),
      hasPatient: includePatient,
      patient: includePatient
        ? { fullName: fullName.trim(), age: Number(age), gender, patientId: patientId?.trim() || '', notes: notes?.trim() || '' }
        : { fullName: '', age: null, gender: '', patientId: '', notes: '' },
      originalFilename: req.file.originalname,
      storagePath, //  Supabase path
      publicUrl,   // Supabase URL
      fileFormat:       path.extname(req.file.originalname).toLowerCase(),
      fileSizeBytes:    req.file.size,
      gradCamEnabled:   gradCamEnabled !== 'false',
      reportEnabled:    reportEnabled === 'true',
      status:           'pending'
    })

    return res.status(201).json({ status: 'success', scan })

  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(e => e.message).join(' ')
      return res.status(400).json({ status: 'fail', message })
    }
    return next(err)
  }
}
// function to analyse the mri scan by calling the ml service
async function analyseScan(req, res, next) {
  const { scanId } = req.body  

  if (!scanId) {
    return res.status(400).json({ status: 'fail', message: 'scanId is required.' })
  }

  //  Find scan (must belong to this user) 
  let scan
  try {
    scan = await Scan.findOne({ _id: scanId, userId: req.user._id })
    if (!scan) {
      return res.status(404).json({ status: 'fail', message: 'Scan not found.' })
    }
    if (scan.status === 'processing') {
      return res.status(409).json({ status: 'fail', message: 'This scan is already being processed.' })
    }
    if (scan.status === 'complete') {
      return res.status(409).json({ status: 'fail', message: 'This scan has already been analysed.' })
    }

    
    scan.status = 'processing'
    await scan.save()
  } catch (err) {
    return next(err)
  }

  // Call FastAPI ML service 
  let mlResult
  try {
    mlResult = await mlService.predict(scan.publicUrl, scan._id)
    
// Upload Grad-CAM to Supabase if available
    if (scan.gradCamEnabled && mlResult.rawResponse?.gradcam_base64) {

      try {

        const buffer = Buffer.from(
          mlResult.rawResponse.gradcam_base64.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        )

        const result = await uploadGradCAM(buffer, scan._id.toString())

        // attach storage info to mlResult so analysisService can store it
        mlResult.gradCamPath = result.gradCamPath
        mlResult.gradCamUrl  = result.gradCamUrl

      } catch (err) {
        console.error('[analyseScan] Grad-CAM upload failed:', err.message)
      }
  }
  } catch (err) {
    // ML service unavailable — mark scan as failed and surface the error
    console.error('[analyseScan] ML service error:', err.message)
    await Scan.findByIdAndUpdate(scan._id, { status: 'failed' })
    return res.status(502).json({
      status:  'fail',
      message: 'ML service unavailable. Please try again later.',
      detail:  err.message
    })
  }

  // Create Analysis document 
  let analysis
  try {
    analysis = await analysisService.createAnalysis(scan._id, req.user._id, mlResult)
  } catch (err) {
    console.error('[analyseScan] Failed to save analysis:', err.message)
    await Scan.findByIdAndUpdate(scan._id, { status: 'failed' })
    return next(err)
  }

  // Update Scan with analysis reference
  try {
    scan.status      = 'complete'
    scan.analysisId  = analysis._id
    scan.processedAt = new Date()
    await scan.save()
  } catch (err) {
    console.error('[analyseScan] Failed to update scan:', err.message)
    return next(err)
  }

  //  Generate PDF report if requested 
   if (scan.reportEnabled) {
    try {
      // Add this log FIRST — confirm the values are present before calling pdfService
      console.log('[analyseScan] About to generate PDF. Analysis values:', {
        predictedClass: analysis.predictedClass,
        confidence:     analysis.confidence,
        probabilities:  analysis.probabilities,
        gradCamUrl:     analysis.gradCamUrl,
      })
 
    
      const plainScan     = JSON.parse(JSON.stringify(scan.toObject()))
      const plainAnalysis = JSON.parse(JSON.stringify(analysis.toObject()))
 
      const { filePath, publicUrl } = await pdfService.generateReport(plainScan, plainAnalysis)
 
      scan.reportPath        = filePath
      scan.reportUrl         = publicUrl
      scan.reportGeneratedAt = new Date()
      await scan.save()
 
      console.log('[analyseScan] PDF report saved to Supabase:', publicUrl)
    } catch (pdfErr) {
      console.error('[analyseScan] PDF generation failed:', pdfErr.message)
    }
  }

  //  Return combined result 
  return res.status(200).json({
    status: 'success',
    scan,
    analysis
  })
}

// GET /api/scans
async function getAllScans(req, res, next) {
  try {
    const scans = await Scan.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('analysisId', 'predictedClass confidence probabilities gradCamUrl createdAt')
    return res.status(200).json({ status: 'success', scans })
  } catch (err) {
    return next(err)
  }
}

// GET /api/scans/:id 
async function getScanById(req, res, next) {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('analysisId')
    if (!scan) {
      return res.status(404).json({ status: 'fail', message: 'Scan not found.' })
    }
    return res.status(200).json({ status: 'success', scan })
  } catch (err) {
    return next(err)
  }
}

// DELETE /api/scans/:id
async function deleteScan(req, res, next) {
  try {
    const scan = await Scan.findOneAndDelete({ _id: req.params.id, userId: req.user._id })
    if (!scan) {
      return res.status(404).json({ status: 'fail', message: 'Scan not found.' })
    }

     // Delete MRI from Supabase
    if (scan.storagePath) await deleteMRI(scan.storagePath)
       // Delete Grad-CAM from Supabase
    if (scan.analysisId?.gradCamPath) {
      await deleteGradCAM(scan.analysisId.gradCamPath)
    }
    // Clean up associated analysis if it exists
    if (scan.analysisId) {
      await analysisService.deleteAnalysisByScanId(scan._id)
    }
    return res.status(200).json({ status: 'success', message: 'Scan deleted.' })
  } catch (err) {
    return next(err)
  }
}

async function downloadReport(req, res, next) {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, userId: req.user._id })
 
    if (!scan) {
      return res.status(404).json({ status: 'fail', message: 'Scan not found.' })
    }
 
    if (!scan.reportUrl) {
      return res.status(404).json({ status: 'fail', message: 'No report has been generated for this scan yet.' })
    }
 
    // Fetch the PDF from Supabase server-side 
    let supabaseResponse
    try {
      supabaseResponse = await axios.get(scan.reportUrl, {
        responseType: 'stream',
        timeout:      15000
      })
    } catch (fetchErr) {
      console.error('[downloadReport] Supabase fetch failed:', fetchErr.message)
      return res.status(404).json({
        status:  'fail',
        message: 'Report file could not be retrieved from storage. It may have been deleted.'
      })
    }
 
    // Tell the browser this is a downloadable PDF with a friendly filename
    const filename = `NeuroVision_Report_${scan.scanId || scan._id}.pdf`
    res.setHeader('Content-Type',        'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
 
    // Pipe the Supabase stream directly into the HTTP response
    // The client receives the bytes as they arrive — no buffering in memory
    supabaseResponse.data.pipe(res)
 
    // If Supabase stream errors mid-transfer, close the response cleanly
    supabaseResponse.data.on('error', (streamErr) => {
      console.error('[downloadReport] Stream error:', streamErr.message)
      if (!res.headersSent) {
        res.status(500).json({ status: 'fail', message: 'Stream interrupted.' })
      } else {
        res.end()
      }
    })
 
  } catch (err) {
    return next(err)
  }
}

// POST /api/scans/:id/report 
// Re-generate the PDF report for a completed scan on demand
async function regenerateReport(req, res, next) {
  try {
    const scan = await Scan.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('analysisId')
    if (!scan) {
      return res.status(404).json({ status: 'fail', message: 'Scan not found.' })
    }
    if (scan.status !== 'complete' || !scan.analysisId) {
      return res.status(400).json({ status: 'fail', message: 'Scan must be complete before generating a report.' })
    }

    const { filePath, publicUrl } = await pdfService.generateReport(
      scan.toObject(),
      scan.analysisId.toObject ? scan.analysisId.toObject() : scan.analysisId
    )

    scan.reportPath        = filePath
    scan.reportUrl         = publicUrl
    scan.reportEnabled     = true
    scan.reportGeneratedAt = new Date()
    await scan.save()

    return res.status(200).json({
      status:    'success',
      reportUrl: publicUrl,
      generatedAt: scan.reportGeneratedAt
    })
  } catch (err) {
    if (err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED')) {
  return res.status(429).json({ status: 'fail', message: 'Gemini AI quota reached. Please try again tomorrow.' })
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({ status: 'fail', message: 'Could not reach the AI service. Check your internet connection.' })
    }
    return next(err)
  }
}

module.exports = { uploadScan, analyseScan, getAllScans, getScanById, deleteScan, downloadReport, regenerateReport }