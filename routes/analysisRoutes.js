const express    = require('express')
const router     = express.Router()
const { getAnalysisByScan, getMyAnalyses } = require('../controllers/analysisController')
const { protect } = require('../middleware/authMiddleware')

// All analysis routes require authentication
router.use(protect)

router.get('/',              getMyAnalyses)      // GET /api/analyses
router.get('/scan/:scanId',  getAnalysisByScan)  // GET /api/analyses/scan/:scanId

module.exports = router