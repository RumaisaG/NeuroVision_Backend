const express = require('express')
const router  = express.Router()
const { protect } = require('../middleware/authMiddleware')
const {
  getProfile,
  updateProfile,
  changePassword,
  getStats,
  deleteAccount
} = require('../controllers/userController')

router.use(protect)   

router.get(   '/me',          getProfile)     // GET    /api/users/me
router.patch( '/me',          updateProfile)  // PATCH  /api/users/me
router.patch( '/me/password', changePassword) // PATCH  /api/users/me/password
router.get(   '/me/stats',    getStats)       // GET    /api/users/me/stats
router.delete('/me',          deleteAccount)  // DELETE /api/users/me

module.exports = router