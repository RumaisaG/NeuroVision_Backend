const jwt  = require('jsonwebtoken')
const User = require('../models/User')

// middleware to ensure that only authenticated users can access protected endpoints
async function protect(req, res, next) {

   try {
    let token
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1]
    }
    // reject the request when no token is found
    if (!token && req.query.token) {
        token = req.query.token
      }
    if (!token) {
        return res.status(401).json({ status: 'fail', message: 'Not authenticated. Please log in.' })
    }
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    const user = await User.findById(decoded.id)
    // verify whether user still exists
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' })
    }
    req.user = user
    next()

  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

module.exports = { protect }