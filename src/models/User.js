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
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  name: {
    type: String,
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  // Aptos Wallet Info
  aptosAddress: {
    type: String,
    unique: true,
    sparse: true
  },
  aptosPublicKey: {
    type: String
  },
  // For internally generated wallets
  encryptedPrivateKey: {
    type: String,
    select: false
  },
  // Flag for wallet-only users
  isWalletUser: {
    type: Boolean,
    default: false
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
    default: 0
  },
  // Security
  lastLogin: {
    type: Date
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving (only if password exists)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password (handle wallet-only users)
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email,
      aptosAddress: this.aptosAddress 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate Aptos wallet address for user
userSchema.methods.generateAptosWallet = async function() {
  const { Account } = await import('@aptos-labs/ts-sdk');
  const crypto = await import('crypto');
  
  // Generate new Aptos account
  const account = Account.generate();
  
  // Store address (public)
  this.aptosAddress = account.accountAddress.toString();
  
  // Store encrypted private key
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(process.env.JWT_SECRET.padEnd(32).slice(0, 32)),
    Buffer.alloc(16, 0)
  );
  let encrypted = cipher.update(account.privateKey.toString(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  this.encryptedPrivateKey = encrypted;
  
  return this.aptosAddress;
};

export default mongoose.model('User', userSchema);