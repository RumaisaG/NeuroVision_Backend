const jwt = require('jsonwebtoken');
const User = require('../models/User');

// helper functions
function signAccessToken(id) {
  return jwt.sign(
    { id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES  }
  )
}

function signRefreshToken(id) {
  return jwt.sign(
    { id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES  }
  )
}

const refreshCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 5 * 24 * 60 * 60 * 1000
}

// send token in HTTP-only cookie
function sendToken(user, statusCode, res) {

  const accessToken = signAccessToken(user._id)
  const refreshToken = signRefreshToken(user._id)

  res.cookie('refreshToken', refreshToken, refreshCookieOptions)

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    user
  })
}

// POST /api/auth/register 
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, institution } = req.body;

    // verifying whether all the required field contain values
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ status: 'fail', message: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters.' });
    }

    // check duplicate email
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ status: 'fail', message: 'This email is already registered.' });
    }

    // create the user
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      passwordHash: password,
      role: role || 'General Practitioner',
      institution: institution || '',
    });

    // send token and user
    sendToken(user, 201, res);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email and password are required.'
      });
    }
  
    const user = await User.findOne({
      email: email.toLowerCase().trim()
    }).select('+passwordHash');
  

    if (!user || !(await user.comparePassword(password))) {
       return res.status(401).json({ status: 'fail', message: 'Invalid email or password.' }); 
    }

    if (!user.isActive) {
      return res.status(403).json({
        status: 'fail',
        message: 'Account deactivated.'
      });
    }

    sendToken(user, 200, res);

  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again.'
    });
  }
};

//GET /api/auth/me 
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found.' });
    }
    res.status(200).json({ status: 'success', user });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Something went wrong.' });
  }
};

// POST /api/auth/logout 
const logout = (req, res) => {
  res.cookie('refreshToken', '', { maxAge: 0 })

  res.json({
    status: 'success',
    message: 'Logged out'
  })
}

const refresh = async (req, res) => {
  try {

    const token = req.cookies.refreshToken

    if (!token) {
      return res.status(401).json({ message: 'Refresh token missing' })
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)

    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({ message: 'User not found' })
    }

    const accessToken = signAccessToken(user._id)

    res.json({
      status: 'success',
      accessToken
    })

  } catch (err) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid refresh token'
    })
  }
}
module.exports = { register, login, getMe, logout, refresh };