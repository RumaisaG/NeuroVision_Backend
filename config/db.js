const mongoose = require('mongoose');

// Function to connect to MongoDB
const connectDB = async () => {
  // Prevent connection when running tests
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected to:", mongoose.connection.name);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;