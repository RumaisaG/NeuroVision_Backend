const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

//  User Schema
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type:     String,
      required: [true, 'First name is required'],
      trim:     true,
      maxlength: 50,
    },
    lastName: {
      type:     String,
      required: [true, 'Last name is required'],
      trim:     true,
      maxlength: 50,
    },

    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false,  
    },
    role: {
      type:    String,
      enum:    ['Neurologist', 'Radiologist', 'General Practitioner', 'Researcher', 'Medical Student'],
      default: 'General Practitioner',
    },
    institution: {
      type:    String,
      trim:    true,
      default: '',
    },
    preferences: {
      darkMode:       { type: Boolean, default: false },
      emailAlerts:    { type: Boolean, default: true  },
      autoReport:     { type: Boolean, default: false },
      gradcamDefault: { type: Boolean, default: true  },
    },
    // soft-delete
    isActive: {
      type:    Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,   
  }
)

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return; 

  const salt = await bcrypt.genSalt(12)
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt)
})

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

// Strip passwordHash from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.passwordHash
  return obj
}

module.exports = mongoose.model('User', userSchema)