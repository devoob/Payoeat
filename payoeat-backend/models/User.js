// backend/models/User.js
import mongoose from 'mongoose';
import validator from 'validator';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Invalid email format',
    }
  },
  password: {
    type: String,
    required: function() {
      return !this.appleId;
    },
  },
  appleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  fullName: {
    type: String,
  },
  authProvider: {
    type: String,
    enum: ['local', 'apple'],
    default: 'local',
  },
  totalApiUsagePrice: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);