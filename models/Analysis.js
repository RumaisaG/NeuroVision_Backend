const mongoose = require('mongoose')

const analysisSchema = new mongoose.Schema(
  {
    scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ML Prediction 
    predictedClass: {
      type:     String,
      enum:     ['NonDemented', 'VeryMildDemented', 'MildDemented', 'ModerateDemented'],
      required: true
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },

    // Raw class probabilities returned by the ML service
    probabilities: {
      NonDemented:      { type: Number, default: 0 },
      VeryMildDemented: { type: Number, default: 0 },
      MildDemented:     { type: Number, default: 0 },
      ModerateDemented: { type: Number, default: 0 }
    },

    // Grad-CAM 
    // Absolute path on disk where the Grad-CAM PNG was saved
    gradCamPath: { type: String, default: '' },  // Supabase path
    gradCamUrl:  { type: String, default: '' },  // Full Supabase public URL

    
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
)

// Indexes
analysisSchema.index({ scanId: 1 }, { unique: true })   // one analysis per scan
analysisSchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.model('Analysis', analysisSchema)