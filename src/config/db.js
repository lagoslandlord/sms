const mongoose = require("mongoose");
const logger = require("../services/loggerService");

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    logger.error("MONGO_URI is undefined. Check your .env file.");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;