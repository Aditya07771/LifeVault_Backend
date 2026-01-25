import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password by default
  },
  name: {
    type: String,
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  // Wallet Info (Backend-managed)
  walletAddress: {
    type: String,
    unique: true,
    sparse: true
  },
  // Profile
  avatar: {
    type: String,
    default: null
  },
  // Stats
  totalMemories: {
    type: Number,
    default: 0
  },
  storageUsed: {
    type: Number,
    default: 0 // in bytes
  },
  // Security
  lastLogin: {
    type: Date
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email,
      walletAddress: this.walletAddress 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate wallet address (simplified - in production use proper key derivation)
userSchema.methods.generateWalletAddress = function() {
  const { ethers } = require('ethers');
  const wallet = ethers.Wallet.createRandom();
  this.walletAddress = wallet.address;
  return wallet.address;
};

// module.exports = mongoose.model('User', userSchema);
export default mongoose.model('User', userSchema);