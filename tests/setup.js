const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')

let mongod

process.env.JWT_ACCESS_SECRET   = 'test_access_secret_neurovision_2024'
process.env.JWT_REFRESH_SECRET  = 'test_refresh_secret_neurovision_2024'
process.env.JWT_ACCESS_EXPIRES  = '15m'
process.env.JWT_REFRESH_EXPIRES = '7d'
process.env.NODE_ENV            = 'test'
process.env.GEMINI_API_KEY      = 'test_gemini_key'
process.env.GEMINI_MODEL        = 'gemini-1.5-flash'
process.env.ML_SERVICE_URL      = 'http://localhost:8000'
process.env.SUPABASE_URL        = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test_supabase_key'
process.env.SUPABASE_BUCKET     = 'mri-scans'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/neurovision_test_placeholder'

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()

  // Connect mongoose to the in-memory instance
  await mongoose.connect(uri)
})

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections
    for (const key in collections) {
      await collections[key].deleteMany({})
    }
  }
})

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase()
    await mongoose.connection.close()
  }
  if (mongod) await mongod.stop()
})