const User = require('../models/User')
const Scan = require('../models/Scan')

   //GET /api/users/profile
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash -refreshToken')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({ user })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}


   //PUT /api/users/profile
async function updateProfile(req, res) {
  try {
    const { firstName, lastName, role, institution } = req.body

    const allowed = [
      'Neurologist',
      'Radiologist',
      'General Practitioner',
      'Researcher',
      'Medical Student'
    ]

    if (role && !allowed.includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' })
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { firstName, lastName, role, institution },
      { new: true, runValidators: true }
    ).select('-passwordHash')

    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    res.status(200).json({ user })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}


   //POST /api/users/change-password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current and new password are required.'
      })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'New password must be at least 8 characters.'
      })
    }

    const user = await User.findById(req.user.id)
      .select('+passwordHash')

    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const valid = await user.comparePassword(currentPassword)

    if (!valid) {
      return res.status(401).json({
        message: 'Current password is incorrect.'
      })
    }

    user.passwordHash = newPassword
    await user.save()

    res.status(200).json({
      message: 'Password updated successfully.'
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}


// to retrieve data about the user scanned data 
async function getStats(req, res) {
  try {
    const userId = req.user.id

    const scans = await Scan.find({ userId })
      .populate('analysisId', 'predictedClass confidence gradCamUrl')
      .lean()

    const total = scans.length
    const completed = scans.filter(s => s.status === 'complete')
    const failed = scans.filter(s => s.status === 'failed').length
    const withReport = scans.filter(s => s.reportUrl).length

    const stageCounts = {
      NonDemented: 0,
      VeryMildDemented: 0,
      MildDemented: 0,
      ModerateDemented: 0
    }

    let totalConfidence = 0
    let confidenceCount = 0

    for (const s of completed) {
      const cls = s.analysisId?.predictedClass

      if (cls && stageCounts[cls] !== undefined) {
        stageCounts[cls]++
      }

      if (s.analysisId?.confidence) {
        totalConfidence += s.analysisId.confidence
        confidenceCount++
      }
    }

    const avgConfidence = confidenceCount
      ? Math.round((totalConfidence / confidenceCount) * 100)
      : null


    // scans this month
    const now = new Date()

    const thisMonth = scans.filter(s => {
      const d = new Date(s.createdAt)
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      )
    }).length


    const weekActivity = buildWeekActivity(scans)
    const monthlyTrend = buildMonthlyTrend(scans)

    res.status(200).json({
      stats: {
        total,
        completed: completed.length,
        failed,
        withReport,
        thisMonth,
        avgConfidence,
        stageCounts,
        weekActivity,
        monthlyTrend
      }
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// function to delete user account from user collection
async function deleteAccount(req, res) {
  try {
    await Scan.deleteMany({ userId: req.user.id })

    await User.findByIdAndDelete(req.user.id)

    res.cookie('refreshToken', '', {
      httpOnly: true,
      maxAge: 0
    })

    res.status(200).json({ message: 'Account deleted.' })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

function buildWeekActivity(scans) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  const now = new Date()
  const monday = new Date(now)

  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0,0,0,0)

  return days.map((label, i) => {

    const dayStart = new Date(monday)
    dayStart.setDate(monday.getDate() + i)

    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayStart.getDate() + 1)

    const count = scans.filter(s => {
      const d = new Date(s.createdAt)
      return d >= dayStart && d < dayEnd
    }).length

    return { label, count }
  })
}


function buildMonthlyTrend(scans) {

  const result = []
  const now = new Date()

  for (let i = 5; i >= 0; i--) {

    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)

    const label = d.toLocaleDateString('en-GB', {
      month: 'short'
    })

    const count = scans.filter(s => {
      const sd = new Date(s.createdAt)
      return (
        sd.getMonth() === d.getMonth() &&
        sd.getFullYear() === d.getFullYear()
      )
    }).length

    result.push({ label, count })
  }

  return result
}


module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getStats,
  deleteAccount
}