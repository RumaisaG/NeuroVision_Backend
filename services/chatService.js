

const { GoogleGenerativeAI } = require('@google/generative-ai')
const Scan     = require('../models/Scan')
const Analysis = require('../models/Analysis')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// ── Stage metadata — identical to your original ───────────────────────────────
const STAGE_INFO = {
  NonDemented: {
    label:    'Non-Demented',
    summary:  "No significant Alzheimer's indicators detected. Brain structure appears within normal parameters.",
    clinical: 'Routine monitoring recommended. No immediate intervention indicated from this scan.'
  },
  VeryMildDemented: {
    label:    'Very Mild Demented',
    summary:  'Very mild cognitive changes detected. Early-stage neurodegeneration markers may be present in memory-related regions.',
    clinical: 'Close monitoring and follow-up imaging advised. Early intervention strategies may be discussed with a neurologist.'
  },
  MildDemented: {
    label:    'Mild Demented',
    summary:  'Mild cognitive impairment detected. Noticeable changes in memory, language, or reasoning may be present.',
    clinical: 'Clinical evaluation by a neurologist is strongly recommended. Cognitive assessments should be performed.'
  },
  ModerateDemented: {
    label:    'Moderate Demented',
    summary:  'Moderate dementia indicators detected. Significant cognitive decline affecting daily functioning.',
    clinical: 'Immediate specialist consultation recommended. Comprehensive care planning should be initiated.'
  }
}

// ── buildContext 
async function buildContext(scanId, userId) {
  const scan = await Scan.findOne({ _id: scanId, userId }).lean()
  if (!scan) throw new Error('Scan not found or access denied.')
  const analysis = await Analysis.findOne({ scanId: scan._id }).lean()

  const lines = []
  lines.push('=== SCAN REPORT ===')
  lines.push(`Scan ID: ${scan.scanId}`)
  lines.push(`File: ${scan.originalFilename}`)
  lines.push(`Upload Date: ${new Date(scan.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  lines.push(`Status: ${scan.status}`)
  lines.push('')
  lines.push('=== PATIENT ===')
  if (scan.hasPatient && scan.patient?.fullName) {
    lines.push(`Name: ${scan.patient.fullName}`)
    lines.push(`Age: ${scan.patient.age}`)
    lines.push(`Gender: ${scan.patient.gender}`)
    if (scan.patient.patientId) lines.push(`Patient ID: ${scan.patient.patientId}`)
    if (scan.patient.notes)     lines.push(`Clinical Notes: ${scan.patient.notes}`)
  } else {
    lines.push('Anonymous — no patient data attached.')
  }
  lines.push('')
  lines.push('=== AI PREDICTION ===')
  if (analysis) {
    const stage   = STAGE_INFO[analysis.predictedClass] || {}
    const confPct = Math.round(analysis.confidence * 100)
    const probs   = Object.entries(analysis.probabilities || {})
      .map(([k, v]) => `${STAGE_INFO[k]?.label || k}: ${Math.round(v * 100)}%`)
      .sort((a, b) => parseFloat(b.split(': ')[1]) - parseFloat(a.split(': ')[1]))
      .join(', ')

    lines.push(`Predicted Stage: ${stage.label || analysis.predictedClass}`)
    lines.push(`Confidence: ${confPct}%`)
    lines.push(`All Probabilities: ${probs}`)
    lines.push(`Model: DenseNet-169 (ADNI dataset)`)
    lines.push(`Stage Description: ${stage.summary || ''}`)
    lines.push(`Clinical Context: ${stage.clinical || ''}`)
    lines.push('')
    lines.push('=== GRAD-CAM ===')
    if (analysis.gradCamUrl) {
      lines.push('A Grad-CAM heatmap was generated. Warmer colours (red/orange) highlight brain regions most influencing the prediction. Key areas include the hippocampus, entorhinal cortex, and temporal lobes.')
    } else {
      lines.push('No Grad-CAM heatmap was generated for this scan.')
    }
  } else {
    lines.push('No analysis available yet. Status: ' + scan.status)
  }

  lines.push('')
  lines.push('=== PDF CLINICAL REPORT ===')
  if (scan.reportUrl) {
    lines.push('A PDF clinical report was automatically generated for this scan.')
    lines.push(`Report generated: ${new Date(scan.reportGeneratedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    lines.push('The report is available for download from the platform.')
    lines.push('The report contains: the full classification result, probability breakdown, Grad-CAM interpretation, clinical recommendations, and a formal disclaimer.')
  } else if (scan.reportEnabled) {
    lines.push('A PDF report was requested but has not yet been generated for this scan.')
  } else {
    lines.push('No PDF report was generated for this scan (the auto-report option was not selected at upload time).')
    lines.push('A report can be generated on demand from the Scan Detail page.')
  }

  lines.push('')
  lines.push('=== END OF REPORT ===')

  return { context: lines.join('\n'), scan, analysis }
}

// ── chat — replaces Ollama axios call with Gemini ─────────────────────────────
// Keeps the exact same signature: chat(scanId, userId, userMessage, history)
// so chatController.js requires ZERO changes.
async function chat(scanId, userId, userMessage, history = []) {
  const { context } = await buildContext(scanId, userId)

  const systemInstruction = `You are NeuroVision Assistant, an AI helper in an Alzheimer's MRI analysis platform.

You have access to the following scan report. Base all your answers on this data only:

${context}

Guidelines:
- Answer questions about the scan result, prediction, confidence, probability breakdown, and Grad-CAM
- Explain Alzheimer's stages in plain, accessible language
- Keep responses concise — 2 to 4 sentences unless more detail is clearly needed
- Never invent information not in the report
- Always end clinical responses with: "Please consult a qualified neurologist or radiologist before acting on this result."`

  const model = genAI.getGenerativeModel({
    model:             process.env.GEMINI_MODEL,
    systemInstruction,
    generationConfig: {
      temperature:     0.3,
      maxOutputTokens: 400
    }
  })

  // Convert history [{role:'user'|'assistant', content}] → Gemini [{role:'user'|'model', parts}]
  const geminiHistory = history.map(h => ({
    role:  h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }]
  }))

  const chatSession = model.startChat({ history: geminiHistory })
  const result      = await chatSession.sendMessage(userMessage)

  return result.response.text().trim()
}

module.exports = { chat, buildContext }