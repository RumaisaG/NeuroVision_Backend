// tests/globalSetup.js
// Runs before any test file is required.
// Sets NODE_ENV=test so server.js skips its MongoDB connection.
module.exports = async function () {
  process.env.NODE_ENV  = 'test'
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/neurovision_test_placeholder'
}