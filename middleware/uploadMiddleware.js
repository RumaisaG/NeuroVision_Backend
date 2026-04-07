const multer = require('multer')

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  const ext = file.originalname.split('.').pop().toLowerCase()
  const allowedExt = ['jpg','jpeg','png','dcm','nii']
  if (allowedExt.includes(ext)) cb(null, true)
  else cb(new Error('Invalid file type.'), false)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }  
})

module.exports = upload