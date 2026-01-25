// import mongoose from 'mongoose';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';

// const userSchema = new mongoose.Schema({
//   email: {
//     type: String,
//     required: [true, 'Email is required'],
//     unique: true,
//     lowercase: true,
//     trim: true,
//     match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
//   },
//   password: {
//     type: String,
//     required: [true, 'Password is required'],
//     minlength: [6, 'Password must be at least 6 characters'],
//     select: false
//   },
//   name: {
//     type: String,
//     trim: true,
//     maxlength: [50, 'Name cannot exceed 50 characters']
//   },
//   // ===========================================
//   // APTOS Wallet Info (Changed from EVM)
//   // ===========================================
//   // Aptos addresses are 64 hex characters (32 bytes)
//   aptosAddress: {
//     type: String,
//     unique: true,
//     sparse: true
//   },
//   // We store encrypted private key for user's dedicated wallet
//   // In production, use proper key management (HSM, etc.)
//   encryptedPrivateKey: {
//     type: String,
//     select: false
//   },
//   // Profile
//   avatar: {
//     type: String,
//     default: null
//   },
//   // Stats
//   totalMemories: {
//     type: Number,
//     default: 0
//   },
//   storageUsed: {
//     type: Number,
//     default: 0
//   },
//   // Security
//   lastLogin: {
//     type: Date
//   },
//   isVerified: {
//     type: Boolean,
//     default: false
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });

// // Hash password before saving
// userSchema.pre('save', async function(next) {
//   if (!this.isModified('password')) {
//     return next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// // Compare password
// userSchema.methods.comparePassword = async function(candidatePassword) {
//   return await bcrypt.compare(candidatePassword, this.password);
// };

// // Generate JWT token
// userSchema.methods.generateAuthToken = function() {
//   return jwt.sign(
//     { 
//       id: this._id, 
//       email: this.email,
//       aptosAddress: this.aptosAddress 
//     },
//     process.env.JWT_SECRET,
//     { expiresIn: process.env.JWT_EXPIRE || '7d' }
//   );
// };

// // Generate Aptos wallet address for user
// userSchema.methods.generateAptosWallet = async function() {
//   const { Account } = require('@aptos-labs/ts-sdk');
  
//   // Generate new Aptos account
//   const account = Account.generate();
  
//   // Store address (public)
//   this.aptosAddress = account.accountAddress.toString();
  
//   // Store encrypted private key (in production, use proper encryption)
//   // This is simplified - use proper key management in production!
//   const crypto = require('crypto');
//   const cipher = crypto.createCipher('aes-256-cbc', process.env.JWT_SECRET);
//   let encrypted = cipher.update(account.privateKey.toString(), 'utf8', 'hex');
//   encrypted += cipher.final('hex');
//   this.encryptedPrivateKey = encrypted;
  
//   return this.aptosAddress;
// };

// export default mongoose.model('User', userSchema);


import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Account } from '@aptos-labs/ts-sdk';

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
    select: false
  },
  name: {
    type: String,
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  aptosAddress: {
    type: String,
    unique: true,
    sparse: true
  },
  aptosPrivateKey: {
    type: String,
    select: false
  },
  totalMemories: {
    type: Number,
    default: 0
  },
  storageUsed: {
    type: Number,
    default: 0
  },
  lastLogin: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
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
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate Aptos wallet
userSchema.methods.generateAptosWallet = async function() {
  const account = Account.generate();
  
  this.aptosAddress = account.accountAddress.toString();
  this.aptosPrivateKey = account.privateKey.toString();
  
  return {
    address: this.aptosAddress,
    privateKey: this.aptosPrivateKey
  };
};

const User = mongoose.model('User', userSchema);

export default User;