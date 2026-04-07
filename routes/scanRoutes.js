const express = require('express')
const router  = express.Router()

const { uploadScan, analyseScan, getAllScans, getScanById, deleteScan, downloadReport, regenerateReport } = require('../controllers/scanController')
const { protect }  = require('../middleware/authMiddleware')
const upload       = require('../middleware/uploadMiddleware')

// All scan routes require authentication
router.use(protect)

router.post('/',            upload.single('scan'), uploadScan)   // POST   /api/scans
router.post('/analyse',     analyseScan)                         // POST   /api/scans/analyse
router.get('/',             getAllScans)                          // GET    /api/scans
router.get('/:id',          getScanById)                         // GET    /api/scans/:id
router.get('/:id/report',   downloadReport)                      // GET    /api/scans/:id/report   — download PDF
router.post('/:id/report',  regenerateReport)                    // POST   /api/scans/:id/report   — (re)generate PDF
router.delete('/:id',       deleteScan)                          // DELETE /api/scans/:id

module.exports = router