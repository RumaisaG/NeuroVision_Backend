const Analysis = require('../models/Analysis')

/**
 * createAnalysis
 * Persists the ML prediction result as an Analysis document.
 *
 * @param {ObjectId} scanId   - The Scan._id this analysis belongs to
 * @param {ObjectId} userId   - The User._id who owns the scan
 * @param {object}   result   - Normalised result from mlService.predict()
 * @returns {Analysis}
 */
async function createAnalysis(scanId, userId, result) {
  const analysis = await Analysis.create({
    scanId,
    userId,
    predictedClass: result.predictedClass,
    confidence:     result.confidence,
    probabilities:  result.probabilities,
    gradCamPath:    result.gradCamPath || null,
    gradCamUrl:     result.gradCamUrl  || null,
    rawResponse:    result.rawResponse || null
  })

  return analysis
}

/**
 * getAnalysisByScanId
 * Fetches the analysis document for a given scan.
 *
 * @param {ObjectId|string} scanId
 * @returns {Analysis|null}
 */
async function getAnalysisByScanId(scanId) {
  return Analysis.findOne({ scanId }).lean()
}

/**
 * getAnalysisByUser
 * Fetches all analyses for a given user, newest first.
 *
 * @param {ObjectId|string} userId
 * @returns {Analysis[]}
 */
async function getAnalysisByUser(userId) {
  return Analysis
    .find({ userId })
    .sort({ createdAt: -1 })
    .populate('scanId', 'scanId originalFilename patient hasPatient status createdAt')
    .lean()
}

/**
 * deleteAnalysisByScanId
 * Removes the analysis document when a scan is deleted.
 *
 * @param {ObjectId|string} scanId
 */
async function deleteAnalysisByScanId(scanId) {
  return Analysis.deleteOne({ scanId })
}

module.exports = {
  createAnalysis,
  getAnalysisByScanId,
  getAnalysisByUser,
  deleteAnalysisByScanId
}