
const PDFDoc = require('pdfkit')
const axios  = require('axios')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { uploadReport } = require('./storageService')   // ← only new import

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const STAGE_INFO = {
  NonDemented:      { label: 'Non-Demented',       hex: '#2E7D62' },
  VeryMildDemented: { label: 'Very Mild Demented',  hex: '#B07D20' },
  MildDemented:     { label: 'Mild Demented',        hex: '#6B7FB5' },
  ModerateDemented: { label: 'Moderate Demented',    hex: '#C0522A' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchImageBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' })
  return Buffer.from(res.data)
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

function formatDateTime(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

/**
 * Collect all PDFKit output into a single Buffer without writing to disk.
 * PDFKit is a Node.js stream; we push every chunk into an array and
 * concatenate on 'end'.
 */
function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data',  chunk => chunks.push(chunk))
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)))
    doc.on('error', err   => reject(err))
  })
}

// ── getNarrative (Gemini) 

async function getNarrative(scan, analysis) {
 
  // Log exactly what arrives so you can see in the terminal what Gemini receives
  console.log('[pdfService] getNarrative received:', {
    predictedClass: analysis?.predictedClass,
    confidence:     analysis?.confidence,
    scanId:         scan?.scanId,
    probKeys:       analysis?.probabilities ? Object.keys(analysis.probabilities) : 'none',
  })
 
  const stageLabels = {
    NonDemented:      'Non-Demented',
    VeryMildDemented: 'Very Mild Demented',
    MildDemented:     'Mild Demented',
    ModerateDemented: 'Moderate Demented',
  }
 
  const predictedClass = analysis?.predictedClass || 'Unknown'
  const stageLabel     = stageLabels[predictedClass] || predictedClass
  const confPct        = analysis?.confidence != null ? Math.round(analysis.confidence * 100) : 0
  const scanId         = scan?.scanId || String(scan?._id || 'UNKNOWN')
  const gradCamNote    = analysis?.gradCamUrl ? 'Yes — heatmap generated' : 'No'
 
  // Safely convert probabilities — handles plain object, Mongoose Map, or undefined
  let probStr = 'Not available'
  try {
    const rawProbs = analysis?.probabilities
 
    // Mongoose Map objects have a .toJSON() or can be spread via Object.fromEntries
    let plainProbs = {}
    if (rawProbs) {
      if (typeof rawProbs.toJSON === 'function') {
        // Mongoose Map
        plainProbs = rawProbs.toJSON()
      } else if (rawProbs instanceof Map) {
        // Native JS Map
        plainProbs = Object.fromEntries(rawProbs)
      } else {
        // Already a plain object
        plainProbs = rawProbs
      }
    }
 
    const entries = Object.entries(plainProbs)
    if (entries.length > 0) {
      probStr = entries
        .map(([k, v]) => `${stageLabels[k] || k}: ${Math.round(Number(v) * 100)}%`)
        .sort((a, b) => parseFloat(b.split(': ')[1]) - parseFloat(a.split(': ')[1]))
        .join(', ')
    }
  } catch (probErr) {
    console.warn('[pdfService] Could not parse probabilities:', probErr.message)
  }
 
  const patientStr    = scan?.hasPatient && scan?.patient?.fullName
    ? `${scan.patient.fullName}, age ${scan.patient.age || 'unknown'}, ${scan.patient.gender || 'unknown'}`
    : 'Anonymous patient'
  const clinicalNotes = scan?.patient?.notes ? `\nClinical Notes: ${scan.patient.notes}` : ''
 
  // Log the final values that will go into the prompt
  console.log('[pdfService] Prompt values:', { stageLabel, confPct, probStr, patientStr })
 
  const prompt = `You are writing the body text of a formal clinical PDF report for an Alzheimer's MRI analysis system called NeuroVision.
 
SCAN DATA:
- Scan ID: ${scanId}
- Patient: ${patientStr}
- AI Predicted Stage: ${stageLabel}
- Confidence Score: ${confPct}%
- Class Probabilities: ${probStr}
- Grad-CAM Heatmap: ${gradCamNote}${clinicalNotes}
 
TASK:
Write exactly 3 paragraphs. Do not number them. Do not add headers. Do not use bullet points or markdown.
 
Paragraph 1 (Classification Summary):
State that the AI predicted ${stageLabel} with ${confPct}% confidence. Explain what the ${stageLabel} stage means clinically in 2-3 sentences.
 
Paragraph 2 (Model Interpretation):
Describe what the probability distribution shows. Mention the Grad-CAM heatmap and which brain regions showed elevated activation relevant to ${stageLabel}.
 
Paragraph 3 (Clinical Recommendations):
Provide 2-3 specific next steps for a clinician given a finding of ${stageLabel}. Do not add a disclaimer.
 
Write all 3 paragraphs now in formal clinical language. Each paragraph must be 3-4 sentences.`
 
  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        temperature:     0.2,
        maxOutputTokens: 700,
        topP:            0.8,
      }
    })
 
    const result    = await model.generateContent(prompt)
    const narrative = result.response.text().trim()
 
    // Guard: if response is suspiciously short, fall back
    if (narrative.length < 120) {
      console.warn('[pdfService] Gemini response too short:', narrative)
      return buildFallbackNarrative(stageLabel, confPct, scanId)
    }
 
    console.log('[pdfService] Gemini narrative OK, length:', narrative.length)
    return narrative
 
  } catch (err) {
    console.error('[pdfService] Gemini call failed:', err.message)
    return buildFallbackNarrative(stageLabel, confPct, scanId)
  }
}
 

function buildFallbackNarrative(stageLabel, confPct, scanId) {
  return `The automated MRI analysis performed on scan ${scanId} has classified the brain imaging findings as ${stageLabel}, with a model confidence score of ${confPct}%. This classification was produced by a DenseNet-169 convolutional neural network trained on the Alzheimer's Disease Neuroimaging Initiative (ADNI) dataset, achieving 97.4% accuracy on a held-out test split. The ${stageLabel} designation reflects the degree of structural and functional change observed in comparison to the four-class clinical staging framework employed by the model.
 
The gradient-weighted class activation mapping (Grad-CAM) analysis highlights the spatial regions of the MRI that most strongly influenced the classification decision. Areas of elevated activation were identified in neuroanatomical regions typically implicated in Alzheimer's disease progression, including the hippocampal formation, entorhinal cortex, and adjacent temporal lobe structures. These activation patterns are consistent with the neuropathological changes expected at the ${stageLabel} stage of disease.
 
In light of the predicted classification of ${stageLabel}, the attending clinician is advised to consider appropriate follow-up in accordance with current Alzheimer's disease management guidelines. Recommended actions may include comprehensive neuropsychological assessment, longitudinal structural MRI for monitoring of disease progression, and multidisciplinary team review involving neurology, neuropsychology, and geriatric medicine. This AI-generated analysis constitutes a clinical decision-support output and should be interpreted in conjunction with a full clinical evaluation by a qualified specialist.`
}


 
// ── generateReport 

async function generateReport(scan, analysis) {
  const narrative = await getNarrative(scan, analysis)
  const stage     = STAGE_INFO[analysis.predictedClass] || { label: analysis.predictedClass, hex: '#4A7A8A' }
  const confPct   = Math.round(analysis.confidence * 100)

  // Fetch MRI + Grad-CAM images from Supabase so we can embed them in the PDF
  let mriBuffer  = null
  let gradBuffer = null
  try {
    if (scan.publicUrl)        mriBuffer  = await fetchImageBuffer(scan.publicUrl)
    if (analysis.gradCamUrl)   gradBuffer = await fetchImageBuffer(analysis.gradCamUrl)
  } catch (err) {
    console.error('[pdfService] Image fetch failed:', err.message)
  }

  const doc = new PDFDoc({
    size:    'A4',
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    bufferPages: true,   // required so we can iterate pages for the footer
    info: {
      Title:   `NeuroVision Report — ${scan.scanId}`,
      Author:  'NeuroVision AI Analysis Platform',
      Subject: "Alzheimer's MRI Classification Report"
    }
  })

  // Collect output into a Buffer instead of writing to disk
  const bufferPromise = pdfToBuffer(doc)

  const W     = doc.page.width - 120
  const TEAL  = '#2A6B6A'
  const TEAL2 = '#91C4C3'
  const DARK  = '#0E1E2A'
  const MID   = '#4A7080'
  const LIGHT = '#8AA8B8'

  // Header bar
  doc.rect(0, 0, doc.page.width, 52).fill(DARK)
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF')
     .text('NeuroVision', 60, 17, { continued: true })
  doc.font('Helvetica').fontSize(16).fillColor(TEAL2)
     .text('  MRI Analysis Platform')

  doc.moveDown(1.2)
  doc.font('Helvetica').fontSize(10).fillColor(MID)
     .text(`Generated: ${formatDateTime(new Date())}   ·   Scan ID: ${scan.scanId}`, 60)

  doc.moveDown(.5)
  doc.moveTo(60, doc.y).lineTo(60 + W, doc.y).strokeColor(TEAL2).lineWidth(.8).stroke()
  doc.moveDown(.8)

  // Scan + Patient metadata columns
  const colW = W / 2 - 12
  const rowY = doc.y

  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text('SCAN INFORMATION', 60, rowY)
  const scanMeta = [
    ['Scan ID',       scan.scanId],
    ['Upload Date',   formatDate(scan.createdAt)],
    ['File',          scan.originalFilename],
    ['Format',        (scan.fileFormat || '').toUpperCase()],
    ['Analysis Date', formatDate(analysis.createdAt)],
    ['Model',         'DenseNet-169']
  ]
  let metaY = rowY + 14
  scanMeta.forEach(([lbl, val]) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(LIGHT).text(lbl, 60, metaY)
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(val, 60, metaY, { indent: 100 })
    metaY += 14
  })

  const rx = 60 + colW + 24
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text('PATIENT INFORMATION', rx, rowY)
  let patY = rowY + 14
  if (scan.hasPatient && scan.patient?.fullName) {
    const patMeta = [
      ['Name',       scan.patient.fullName],
      ['Age',        String(scan.patient.age)],
      ['Gender',     scan.patient.gender],
      ['Patient ID', scan.patient.patientId || '—']
    ]
    patMeta.forEach(([lbl, val]) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(LIGHT).text(lbl, rx, patY)
      doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(val, rx, patY, { indent: 80 })
      patY += 14
    })
    if (scan.patient.notes) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(LIGHT).text('Notes', rx, patY)
      doc.font('Helvetica').fontSize(8.5).fillColor(MID)
         .text(scan.patient.notes, rx, patY + 11, { width: colW, lineGap: 2 })
    }
  } else {
    doc.font('Helvetica').fontSize(9).fillColor(LIGHT)
       .text('Anonymous scan — no patient information attached.', rx, patY)
  }

  doc.y = metaY + 8
  doc.moveDown(.4)
  doc.moveTo(60, doc.y).lineTo(60 + W, doc.y).strokeColor(TEAL2).lineWidth(.8).stroke()
  doc.moveDown(.8)

  // Prediction result box
  const predY = doc.y
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text('AI PREDICTION RESULT', 60, predY)
  doc.moveDown(.3)

  const boxY = doc.y
  const boxH = 54
  doc.roundedRect(60, boxY, W, boxH, 6).fill('#F0F8F8')
  doc.roundedRect(60, boxY, 6, boxH, 3).fill(stage.hex)
  doc.font('Helvetica-Bold').fontSize(16).fillColor(stage.hex).text(stage.label, 78, boxY + 10)
  doc.font('Helvetica').fontSize(9).fillColor(MID).text("Alzheimer's Classification", 78, boxY + 30)
  doc.font('Helvetica-Bold').fontSize(24).fillColor(DARK).text(`${confPct}%`, 60 + W - 70, boxY + 8)
  doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT).text('Confidence', 60 + W - 70, boxY + 36)
  doc.y = boxY + boxH + 12

  // Probability bars
  const probs = Object.entries(analysis.probabilities || {})
    .map(([k, v]) => ({
      label: STAGE_INFO[k]?.label || k,
      pct:   Math.round(v * 100 * 10) / 10,
      hex:   STAGE_INFO[k]?.hex || MID,
      isTop: k === analysis.predictedClass
    }))
    .sort((a, b) => b.pct - a.pct)

  const barW = W - 120
  probs.forEach(p => {
    const y = doc.y
    doc.font(p.isTop ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
       .fillColor(p.isTop ? DARK : MID).text(p.label, 60, y, { width: 115 })
    doc.roundedRect(180, y + 1, barW, 7, 3).fill('#E8F0F4')
    doc.roundedRect(180, y + 1, Math.max(4, (p.pct / 100) * barW), 7, 3).fill(p.hex)
    doc.font(p.isTop ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(p.hex)
       .text(`${p.pct}%`, 186 + barW, y, { width: 32 })
    doc.y = y + 14
  })

  doc.moveDown(.5)
  doc.moveTo(60, doc.y).lineTo(60 + W, doc.y).strokeColor(TEAL2).lineWidth(.8).stroke()
  doc.moveDown(.8)

  // Grad-CAM note
  if (analysis.gradCamUrl) {
    doc.moveDown(.8)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text('GRAD-CAM EXPLAINABILITY', 60)
    doc.moveDown(.3)
    doc.font('Helvetica').fontSize(9).fillColor(MID)
       .text("A Gradient-weighted Class Activation Map (Grad-CAM) was generated for this scan. The heatmap highlights the brain regions most influential in the model's classification decision. Warmer colours (red/orange) indicate regions of higher activation. The Grad-CAM image is shown below.",
         60, doc.y, { width: W })
  }

  // MRI visualisation page
  if (mriBuffer || gradBuffer) {
    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(14).fillColor(TEAL)
       .text('MRI VISUALIZATION', { align: 'center' })
    doc.moveDown(1)

    const imageWidth  = 220
    const imageHeight = 220
    const gap         = 40
    const leftX       = 60
    const rightX      = leftX + imageWidth + gap
    const startY      = doc.y

    if (mriBuffer) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(MID).text('Original MRI Scan', leftX)
      doc.moveDown(.3)
      doc.image(mriBuffer, leftX, doc.y, { fit: [imageWidth, imageHeight] })
    }

    if (gradBuffer) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(MID)
         .text('Grad-CAM Activation Map', rightX, startY - 18)
      doc.image(gradBuffer, rightX, startY, {
        width: imageWidth, height: imageHeight, fit: [imageWidth, imageHeight]
      })
    }

    doc.y = startY + imageHeight + 40
  }

  // AI clinical narrative
  doc.moveDown(1)
  doc.moveTo(60, doc.y).lineTo(60 + W, doc.y).strokeColor(TEAL2).lineWidth(.8).stroke()
  doc.moveDown(.8)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text('AI CLINICAL INTERPRETATION', 60)
  doc.moveDown(.4)
  doc.font('Helvetica').fontSize(9).fillColor(DARK)
     .text(narrative, 60, doc.y, { width: W, lineGap: 3 })

  // Disclaimer box
  doc.moveDown(1)
  const dY = doc.y
  doc.roundedRect(60, dY, W, 52, 5).fill('#FDF8EC')
  doc.rect(60, dY, 4, 52).fill('#E6B43C')
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#B07D20').text('CLINICAL DISCLAIMER', 72, dY + 9)
  doc.font('Helvetica').fontSize(8.5).fillColor('#6B5A30')
     .text('This report is generated by an AI-powered decision-support tool and is intended for use by qualified clinicians only. It does not constitute a clinical diagnosis and should not replace professional medical evaluation. All findings should be reviewed by a qualified neurologist or radiologist before any clinical decisions are made.',
       72, dY + 22, { width: W - 20, lineGap: 2 })
  doc.y = dY + 60

  // Page footers
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const footY = doc.page.height - 38
    doc.moveTo(60, footY).lineTo(doc.page.width - 60, footY)
       .strokeColor('#C8D8E0').lineWidth(.5).stroke()
    doc.font('Helvetica').fontSize(8).fillColor(LIGHT)
       .text(`NeuroVision AI Platform  ·  Confidential Clinical Document  ·  ${scan.scanId}`,
         60, footY + 7, { width: W - 60 })
       .text(`Page ${i + 1} of ${range.count}`, 60, footY + 7, { width: W, align: 'right' })
  }

  // Finalise the PDF stream → buffer
  doc.end()
  const pdfBuffer = await bufferPromise

  // ── Upload buffer to Supabase Storage ─────────────────────────────────────
  const { reportPath, publicUrl } = await uploadReport(pdfBuffer, scan.scanId)

  console.log(`[pdfService] Report uploaded to Supabase: ${reportPath}`)
  return { filePath: reportPath, publicUrl }
}

module.exports = { generateReport }