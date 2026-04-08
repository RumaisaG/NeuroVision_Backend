const express    = require('express')
const router     = express.Router()
const { getAnalysisByScan, getMyAnalyses } = require('../controllers/analysisController')
const { protect } = require('../middleware/authMiddleware')

// All analysis routes require authentication
router.use(protect)

router.get('/',              getMyAnalyses)      
router.get('/scan/:scanId',  getAnalysisByScan) 

module.exports = router