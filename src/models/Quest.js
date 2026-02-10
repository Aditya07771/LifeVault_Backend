import mongoose from 'mongoose';
import crypto from 'crypto';
import { QUEST_TYPES, QUEST_STATUS, VERIFICATION_LAYERS, DEFAULTS } from '../config/constants.js';

const questSchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: [true, 'Quest title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Quest description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  shortCode: {
    type: String,
    unique: true,
    index: true
  },

  // Creator Info
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  creatorType: {
    type: String,
    enum: ['user', 'brand', 'government', 'organization'],
    default: 'user'
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    index: true
  },

  // Quest Type & Configuration
  questType: {
    type: String,
    enum: Object.values(QUEST_TYPES),
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },

  // Location Requirements
  location: {
    name: { type: String },
    address: { type: String },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: function() { 
          return this.questType === QUEST_TYPES.LOCATION || 
                 this.questType === QUEST_TYPES.TWIN_LOCK;
        }
      }
    },
    radiusMeters: {
      type: Number,
      default: DEFAULTS.GPS_RADIUS_METERS,
      min: 10,
      max: 5000
    },
    country: { type: String },
    city: { type: String }
  },

  // Time Window Requirements
  timeWindow: {
    enabled: { type: Boolean, default: false },
    startTime: { type: String }, // HH:MM format
    endTime: { type: String },   // HH:MM format
    timezone: { type: String, default: 'UTC' },
    specificDates: [{
      date: Date,
      startTime: String,
      endTime: String
    }],
    daysOfWeek: [{ type: Number, min: 0, max: 6 }] // 0 = Sunday
  },

  // QR Code Requirements
  qrCode: {
    enabled: { type: Boolean, default: false },
    code: { type: String, select: false }, // Secret QR content
    codeHash: { type: String }, // For verification without exposing code
    regenerateDaily: { type: Boolean, default: false },
    lastRegenerated: { type: Date }
  },

  // AI Vision Requirements
  aiVerification: {
    enabled: { type: Boolean, default: false },
    prompt: { 
      type: String,
      maxlength: [500, 'AI prompt cannot exceed 500 characters']
    },
    requiredObjects: [{ type: String }], // e.g., ["Taj Mahal", "person", "smile"]
    minimumConfidence: { type: Number, default: 0.75, min: 0, max: 1 },
    rejectBlurry: { type: Boolean, default: true },
    requireFace: { type: Boolean, default: false },
    requireSelfie: { type: Boolean, default: false }
  },

  // Verification Layers (for Twin-Lock)
  verificationLayers: [{
    type: String,
    enum: Object.values(VERIFICATION_LAYERS)
  }],

  // Rewards
  rewards: {
    aptAmount: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    badgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    },
    nftMetadata: {
      enabled: { type: Boolean, default: false },
      name: { type: String },
      description: { type: String },
      imageUrl: { type: String },
      attributes: [{ 
        trait_type: String, 
        value: mongoose.Schema.Types.Mixed 
      }]
    },
    customReward: {
      type: { type: String },
      value: mongoose.Schema.Types.Mixed
    }
  },

  // Budget & Limits
  budget: {
    totalAptAllocated: { type: Number, default: 0 },
    aptRemaining: { type: Number, default: 0 },
    maxCompletions: { type: Number, default: null }, // null = unlimited
    maxCompletionsPerUser: { type: Number, default: 1 },
    dailyLimit: { type: Number, default: null }
  },

  // Status & Scheduling
  status: {
    type: String,
    enum: Object.values(QUEST_STATUS),
    default: QUEST_STATUS.DRAFT
  },
  startDate: { type: Date },
  endDate: { type: Date },
  
  // Statistics
  stats: {
    totalAttempts: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },
    totalRewardsDistributed: { type: Number, default: 0 },
    averageCompletionTime: { type: Number, default: 0 }, // seconds
    failureReasons: {
      locationMismatch: { type: Number, default: 0 },
      timeWindowClosed: { type: Number, default: 0 },
      aiRejected: { type: Number, default: 0 },
      qrInvalid: { type: Number, default: 0 }
    }
  },

  // Media
  coverImage: { type: String },
  thumbnailImage: { type: String },
  galleryImages: [{ type: String }],

  // Blockchain
  onChainQuestId: { type: String },
  contractAddress: { type: String },
  txHash: { type: String },

  // Tags & Categories
  tags: [{ type: String }],
  category: {
    type: String,
    enum: ['adventure', 'food', 'culture', 'shopping', 'nature', 'entertainment', 'sports', 'education', 'other'],
    default: 'other'
  },

  // Difficulty
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert'],
    default: 'easy'
  },
  estimatedTime: { type: Number }, // minutes

  // Flags
  isFeatured: { type: Boolean, default: false },
  isSponsored: { type: Boolean, default: false },
  requiresApproval: { type: Boolean, default: false },

  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
questSchema.index({ 'location.coordinates': '2dsphere' });
questSchema.index({ status: 1, startDate: 1, endDate: 1 });
questSchema.index({ creatorId: 1, status: 1 });
questSchema.index({ campaignId: 1 });
questSchema.index({ tags: 1 });
questSchema.index({ category: 1 });

// Generate short code before saving
questSchema.pre('save', function(next) {
  if (!this.shortCode) {
    this.shortCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  
  // Generate QR code hash if QR is enabled
  if (this.qrCode?.enabled && this.qrCode?.code && !this.qrCode?.codeHash) {
    this.qrCode.codeHash = crypto
      .createHash('sha256')
      .update(this.qrCode.code)
      .digest('hex');
  }
  
  next();
});

// Virtual: Check if quest is currently active
questSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === QUEST_STATUS.ACTIVE &&
         (!this.startDate || now >= this.startDate) &&
         (!this.endDate || now <= this.endDate);
});

// Virtual: Check if within time window
questSchema.virtual('isWithinTimeWindow').get(function() {
  if (!this.timeWindow?.enabled) return true;
  
  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: this.timeWindow.timezone || 'UTC'
  });
  
  if (this.timeWindow.startTime && this.timeWindow.endTime) {
    return currentTime >= this.timeWindow.startTime && 
           currentTime <= this.timeWindow.endTime;
  }
  
  return true;
});

// Virtual: Remaining completions
questSchema.virtual('remainingCompletions').get(function() {
  if (!this.budget.maxCompletions) return null;
  return this.budget.maxCompletions - this.stats.totalCompletions;
});

// Method: Check if user can attempt
questSchema.methods.canUserAttempt = async function(userId) {
  const QuestCompletion = mongoose.model('QuestCompletion');
  
  // Check if quest is active
  if (!this.isActive) {
    return { canAttempt: false, reason: 'Quest is not active' };
  }
  
  // Check max completions
  if (this.budget.maxCompletions && 
      this.stats.totalCompletions >= this.budget.maxCompletions) {
    return { canAttempt: false, reason: 'Quest has reached maximum completions' };
  }
  
  // Check per-user limit
  const userCompletions = await QuestCompletion.countDocuments({
    questId: this._id,
    userId,
    status: 'completed'
  });
  
  if (userCompletions >= this.budget.maxCompletionsPerUser) {
    return { canAttempt: false, reason: 'You have already completed this quest' };
  }
  
  // Check daily limit
  if (this.budget.dailyLimit) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCompletions = await QuestCompletion.countDocuments({
      questId: this._id,
      status: 'completed',
      completedAt: { $gte: today }
    });
    
    if (todayCompletions >= this.budget.dailyLimit) {
      return { canAttempt: false, reason: 'Daily limit reached. Try again tomorrow!' };
    }
  }
  
  // Check budget
  if (this.rewards.aptAmount > 0 && 
      this.budget.aptRemaining < this.rewards.aptAmount) {
    return { canAttempt: false, reason: 'Quest reward budget exhausted' };
  }
  
  return { canAttempt: true };
};

// Static: Find nearby quests
questSchema.statics.findNearby = async function(longitude, latitude, maxDistanceMeters = 5000, options = {}) {
  const query = {
    status: QUEST_STATUS.ACTIVE,
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceMeters
      }
    }
  };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.questType) {
    query.questType = options.questType;
  }
  
  return this.find(query).limit(options.limit || 50);
};

export default mongoose.model('Quest', questSchema);