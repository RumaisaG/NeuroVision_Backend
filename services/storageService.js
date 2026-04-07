const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const BUCKET = process.env.SUPABASE_BUCKET

/**
 * Upload an MRI file buffer to Supabase Storage.
 */
async function uploadMRI(buffer, originalName, mimeType) {
  const ext      = path.extname(originalName).toLowerCase()
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  const filePath = `scans/${filename}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: mimeType, upsert: false })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return { storagePath: filePath, publicUrl: data.publicUrl }
}

/**
 * Delete an MRI file from Supabase Storage.
 */
async function deleteMRI(storagePath) {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (error) console.error('[Supabase delete error]', error.message)
}

/**
 * Upload a Grad-CAM PNG buffer to Supabase Storage.
 */
async function uploadGradCAM(buffer, scanId) {
  const filePath = `gradcam/${scanId}-gradcam.png`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: 'image/png', upsert: true })

  if (error) throw new Error(`Supabase GradCAM upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return { gradCamPath: filePath, gradCamUrl: data.publicUrl }
}

/**
 * Delete a Grad-CAM file from Supabase.
 */
async function deleteGradCAM(gradCamPath) {
  if (!gradCamPath) return
  const { error } = await supabase.storage.from(BUCKET).remove([gradCamPath])
  if (error) console.error('[Supabase GradCAM delete]', error.message)
}

/**
 * Upload a PDF report buffer to Supabase Storage.
 * @param {Buffer} buffer  - PDF file contents
 * @param {string} scanId  - used to build a deterministic filename
 * @returns {{ reportPath: string, publicUrl: string }}
 */
async function uploadReport(buffer, scanId) {
  const filename = `report_${scanId}_${Date.now()}.pdf`
  const filePath = `reports/${filename}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert:      false
    })

  if (error) throw new Error(`Supabase report upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return { reportPath: filePath, publicUrl: data.publicUrl }
}

/**
 * Delete a PDF report from Supabase Storage.
 * @param {string} reportPath - e.g. "reports/report_SC-ABC_1714000000.pdf"
 */
async function deleteReport(reportPath) {
  if (!reportPath) return
  const { error } = await supabase.storage.from(BUCKET).remove([reportPath])
  if (error) console.error('[Supabase report delete]', error.message)
}

module.exports = { uploadMRI, deleteMRI, uploadGradCAM, deleteGradCAM, uploadReport, deleteReport }