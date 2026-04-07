const mongoose = require('mongoose')

const scanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scanId: { type: String, required: true, unique: true },

  // Patient Information 
  hasPatient: { type: Boolean, default: false },
  patient: {
    fullName:  { type: String, trim: true, default: '' },
    age:       { type: Number, default: null },
    gender:    {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say', ''],
      default: ''
    },
    patientId: { type: String, trim: true, default: '' },
    notes:     { type: String, trim: true, default: '' }
  },

  // File Information 
  originalFilename: { type: String, required: true },
  storagePath:  { type: String, default: '' },   
  publicUrl:    { type: String, default: '' },  
  fileFormat:       { type: String, required: true },
  fileSizeBytes:    { type: Number, required: true },

  // Processing State
  status: {
    type:    String,
    enum:    ['pending', 'processing', 'complete', 'failed'],
    default: 'pending'
  },

  analysisId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis', default: null },
  gradCamEnabled: { type: Boolean, default: true },
  processedAt:    { type: Date, default: null },

  reportEnabled:  { type: Boolean, default: false },
  reportPath:     { type: String, default: null },   
  reportUrl:      { type: String, default: null },   
  reportGeneratedAt: { type: Date, default: null }

}, { timestamps: true })

scanSchema.index({ userId: 1, createdAt: -1 })
scanSchema.index({ status: 1, createdAt: 1 })
scanSchema.index({ 'patient.fullName': 'text', 'patient.patientId': 'text' })

module.exports = mongoose.model('Scan', scanSchema)