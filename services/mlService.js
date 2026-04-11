const axios    = require('axios')

const ML_URL     = process.env.ML_SERVICE_URL || 'http://localhost:8000'

// Class label mapping 
const CLASS_MAP = {
  // FastAPI label  : Analysis schema enum
  CN:               'NonDemented',
  EMCI:             'VeryMildDemented',
  LMCI:             'MildDemented',
  AD:               'ModerateDemented',
  NonDemented:      'NonDemented',
  VeryMildDemented: 'VeryMildDemented',
  MildDemented:     'MildDemented',
  ModerateDemented: 'ModerateDemented'
}


// Maps FastAPI probability keys → our schema keys
const PROB_MAP = {
  CN:               'NonDemented',
  EMCI:             'VeryMildDemented',
  LMCI:             'MildDemented',
  AD:               'ModerateDemented',
  NonDemented:      'NonDemented',
  VeryMildDemented: 'VeryMildDemented',
  MildDemented:     'MildDemented',
  ModerateDemented: 'ModerateDemented'
}

function normaliseProbabilities(rawProbs) {
  const result = {
    NonDemented:      0,
    VeryMildDemented: 0,
    MildDemented:     0,
    ModerateDemented: 0
  }

  if (!rawProbs || typeof rawProbs !== 'object') return result

  for (const [key, val] of Object.entries(rawProbs)) {
    const mapped = PROB_MAP[key]
    if (mapped) result[mapped] = val
  }

  return result
}

/**
 * predict
 * Sends the MRI image file to FastAPI /predict and returns a normalised result.
 *
 * @param {string} filePath  - Absolute path to the uploaded MRI file on disk
 * @param {string} scanId    - Used to name the Grad-CAM output file
 * @returns {object}         - Normalised prediction result
 */
async function predict(imageUrl, scanId) {


  const response = await axios.post(`${ML_URL}/predict`, {
    image_url: imageUrl,
    scan_id: scanId
  }, {
    timeout: 60000
  })

  const raw = response.data

  const predictedClass = CLASS_MAP[raw.predicted_class]

  if (!predictedClass) {
    throw new Error(`Unknown predicted_class from ML service: "${raw.predicted_class}"`)
  }

  return {
    predictedClass,
    confidence: raw.confidence,
    probabilities: normaliseProbabilities(raw.probabilities),

    // Return Grad-CAM base64 so controller can upload to Supabase
    gradcam_base64: raw.gradcam_base64 || null,

    rawResponse: raw
  }
}

module.exports = { predict }