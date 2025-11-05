// backend/config/db.js
import mongoose from 'mongoose';
const MongoURI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(MongoURI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

export default connectDB;