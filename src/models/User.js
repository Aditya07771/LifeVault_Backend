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
  encryptedPrivateKey: {
    type: String,
    select: false
  },
  isWalletUser: {
    type: Boolean,
    default: false
  },
  
  // Profile
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 500
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

  // ========== NEW: QUEST/GAMIFICATION FIELDS ==========
  
  // Quest Statistics
  questStats: {
    totalCompleted: { type: Number, default: 0 },
    totalAttempted: { type: Number, default: 0 },
    totalPointsEarned: { type: Number, default: 0 },
    totalAptEarned: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastCompletedAt: { type: Date }
  },

  // Badges
  badges: [{
    badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge' },
    awardedAt: { type: Date, default: Date.now },
    questCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestCompletion' },
    txHash: { type: String }
  }],

  // Points/Currency
  points: {
    current: { type: Number, default: 0 },
    lifetime: { type: Number, default: 0 }
  },

  // Level/Rank
  level: {
    current: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    xpToNextLevel: { type: Number, default: 100 }
  },

  // Campaign Participation
  campaigns: [{
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    joinedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    progress: { type: Number, default: 0 }
  }],

  // Stories
  storiesCreated: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Story' }],
  storiesReceived: [{
    storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
    receivedAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
  }],

  // User Role/Type
  userType: {
    type: String,
    enum: ['user', 'creator', 'brand', 'government', 'admin'],
    default: 'user'
  },

  // Brand/Organization Info (for verified creators)
  organizationInfo: {
    name: { type: String },
    description: { type: String },
    website: { type: String },
    logo: { type: String },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    category: { type: String }
  },

  // Preferences
  preferences: {
    notifications: {
      questNearby: { type: Boolean, default: true },
      campaignUpdates: { type: Boolean, default: true },
      rewardsEarned: { type: Boolean, default: true },
      storyUnlocks: { type: Boolean, default: true }
    },
    privacy: {
      showProfile: { type: Boolean, default: true },
      showBadges: { type: Boolean, default: true },
      showStats: { type: Boolean, default: true }
    },
    defaultRadius: { type: Number, default: 5000 } // meters
  },

  // ========== END NEW FIELDS ==========

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

// Indexes
userSchema.index({ 'questStats.totalCompleted': -1 });
userSchema.index({ 'level.current': -1 });
userSchema.index({ userType: 1 });

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
      aptosAddress: this.aptosAddress,
      userType: this.userType
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate Aptos wallet address for user
userSchema.methods.generateAptosWallet = async function() {
  const { Account } = await import('@aptos-labs/ts-sdk');
  const crypto = await import('crypto');
  
  const account = Account.generate();
  this.aptosAddress = account.accountAddress.toString();
  
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

// ========== NEW METHODS ==========

// Add XP and check for level up
userSchema.methods.addXP = async function(amount) {
  this.level.xp += amount;
  
  while (this.level.xp >= this.level.xpToNextLevel) {
    this.level.xp -= this.level.xpToNextLevel;
    this.level.current += 1;
    this.level.xpToNextLevel = Math.floor(this.level.xpToNextLevel * 1.5);
  }
  
  return this.save();
};

// Add points
userSchema.methods.addPoints = async function(amount) {
  this.points.current += amount;
  this.points.lifetime += amount;
  return this.save();
};

// Update quest streak
userSchema.methods.updateStreak = async function() {
  const now = new Date();
  const lastCompleted = this.questStats.lastCompletedAt;
  
  if (lastCompleted) {
    const hoursSinceLastQuest = (now - lastCompleted) / (1000 * 60 * 60);
    
    if (hoursSinceLastQuest <= 24) {
      this.questStats.currentStreak += 1;
      if (this.questStats.currentStreak > this.questStats.longestStreak) {
        this.questStats.longestStreak = this.questStats.currentStreak;
      }
    } else if (hoursSinceLastQuest > 48) {
      this.questStats.currentStreak = 1;
    }
  } else {
    this.questStats.currentStreak = 1;
  }
  
  this.questStats.lastCompletedAt = now;
  return this.save();
};

// Get public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    name: this.name,
    avatar: this.avatar,
    level: this.level.current,
    badges: this.badges.length,
    questsCompleted: this.questStats.totalCompleted,
    isVerified: this.organizationInfo?.isVerified || false
  };
};

export default mongoose.model('User', userSchema);