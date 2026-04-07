const analysisService = require('../services/analysisService')

//  GET /api/analyses/scan/:scanId 
// it will return the analysis for a specific scan
async function getAnalysisByScan(req, res, next) {
  try {
    const analysis = await analysisService.getAnalysisByScanId(req.params.scanId)

    if (!analysis) {
      return res.status(404).json({ status: 'fail', message: 'No analysis found for this scan.' })
    }

    if (analysis.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'fail', message: 'Not authorised.' })
    }

    return res.status(200).json({ status: 'success', analysis })
  } catch (err) {
    return next(err)
  }
}

//GET /api/analyses 
// it will return all analyses for the logged-in user
async function getMyAnalyses(req, res, next) {
  try {
    const analyses = await analysisService.getAnalysisByUser(req.user._id)
    return res.status(200).json({ status: 'success', count: analyses.length, analyses })
  } catch (err) {
    return next(err)
  }
}

module.exports = { getAnalysisByScan, getMyAnalyses }