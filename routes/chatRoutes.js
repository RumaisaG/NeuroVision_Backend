const express        = require('express')
const router         = express.Router()
const { protect }    = require('../middleware/authMiddleware')
const chatController = require('../controllers/chatController')

// POST /api/chat/:scanId  — send a message for a specific scan
router.post('/:scanId', protect, chatController.sendMessage)

module.exports = router