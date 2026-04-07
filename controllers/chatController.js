const chatService = require('../services/chatService')


async function sendMessage(req, res, next) {
  try {
    const { scanId } = req.params
    const { message, history = [] } = req.body

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' })
    }

    const reply = await chatService.chat(
      scanId,
      req.user._id,
      message.trim(),
      history
    )
    res.json({ reply })

  } catch (err) {
   
    // Missing or invalid API key
    if (err.message?.includes('API_KEY') || err.message?.includes('API key')) {
      return res.status(503).json({
        message: 'AI service not configured. Please set a valid GEMINI_API_KEY.'
      })
    }
    // Rate limit
    if (err.status === 429) {
      return res.status(429).json({
        message: 'AI rate limit reached. Please wait a moment and try again.'
      })
    }
    // Content safety filter
    if (err.message?.includes('SAFETY') || err.message?.includes('blocked')) {
      return res.status(400).json({
        message: 'Message was blocked by the AI safety filter. Please rephrase your question.'
      })
    }
    // Network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({
        message: 'Could not reach the AI service. Please check your internet connection.'
      })
    }
    next(err)
  }
}

module.exports = { sendMessage }