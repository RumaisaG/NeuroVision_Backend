const express   = require('express');
const cors      = require('cors');
const dotenv    = require('dotenv');
const cookieParser = require('cookie-parser')
const connectDB = require('./config/db');
const path         = require('path')

dotenv.config();
connectDB();

const authRoutes = require('./routes/authRoutes')
const scanRoutes = require('./routes/scanRoutes')
const analysisRoutes = require('./routes/analysisRoutes')
const chatRoutes     = require('./routes/chatRoutes')
const userRoutes     = require('./routes/userRoutes')

const app = express();

app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true   // allow cookies
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))


// Routes
app.use('/api/auth',  authRoutes)
app.use('/api/scans', scanRoutes)
app.use('/api/analyses', analysisRoutes)
app.use('/api/chat',     chatRoutes)
app.use('/api/users',    userRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NeuroVision API' });
});

app.use(function(err, req, res, next) {
  console.error('[Error]', err.message)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ status: 'fail', message: 'File too large. Maximum size is 50MB.' })
  }
  if (err.message && err.message.startsWith('Invalid file format')) {
    return res.status(400).json({ status: 'fail', message: err.message })
  }
  res.status(err.statusCode || 500).json({
    status:  'error',
    message: err.message || 'Internal server error'
  })
})

// Start server only outside tests
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Express running on http://localhost:${PORT}`);
  });
}

module.exports = app;