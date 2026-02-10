import mongoose from 'mongoose';
import { VERIFICATION_RESULT } from '../config/constants.js';

const questCompletionSchema = new mongoose.Schema({
  // References
  questId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quest',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    index: true
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'verifying', 'completed', 'failed', 'rejected'],
    default: 'pending'
  },
  attemptNumber: {
    type: Number,
    default: 1
  },

  // Submitted Data
  submission: {
    // Photo/Media
    photoUrl: { type: String },
    photoIpfsHash: { type: String },
    thumbnailUrl: { type: String },
    
    // Location Data
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number }, // meters
      altitude: { type: Number },
      heading: { type: Number },
      speed: { type: Number },
      timestamp: { type: Date }
    },
    
    // QR Code
    qrCodeScanned: { type: String },
    
    // Device Info (for anti-spoofing)
    deviceInfo: {
      platform: { type: String },
      osVersion: { type: String },
      appVersion: { type: String },
      deviceId: { type: String },
      isEmulator: { type: Boolean },
      isMockLocation: { type: Boolean }
    },
    
    // Timestamps
    capturedAt: { type: Date },
    submittedAt: { type: Date, default: Date.now }
  },

  // Verification Results
  verification: {
    // Overall Result
    overallResult: {
      type: String,
      enum: Object.values(VERIFICATION_RESULT),
      default: VERIFICATION_RESULT.PENDING
    },
    overallScore: { type: Number, min: 0, max: 1 },
    
    // GPS Verification
    gps: {
      passed: { type: Boolean },
      distanceMeters: { type: Number },
      withinRadius: { type: Boolean },
      message: { type: String }
    },
    
    // Time Window Verification
    timeWindow: {
      passed: { type: Boolean },
      submissionTime: { type: String },
      allowedWindow: { type: String },
      message: { type: String }
    },
    
    // AI Vision Verification
    aiVision: {
      passed: { type: Boolean },
      confidence: { type: Number },
      detectedObjects: [{ 
        object: String, 
        confidence: Number 
      }],
      requiredObjectsFound: [{ type: String }],
      requiredObjectsMissing: [{ type: String }],
      isBlurry: { type: Boolean },
      hasFace: { type: Boolean },
      isSelfie: { type: Boolean },
      rawResponse: { type: mongoose.Schema.Types.Mixed },
      message: { type: String }
    },
    
    // QR Code Verification
    qrCode: {
      passed: { type: Boolean },
      codeMatched: { type: Boolean },
      message: { type: String }
    },
    
    // Anti-Spoofing Checks
    antiSpoofing: {
      passed: { type: Boolean },
      checks: [{
        check: String,
        passed: Boolean,
        details: String
      }],
      riskScore: { type: Number, min: 0, max: 1 }
    },
    
    // Timestamps
    startedAt: { type: Date },
    completedAt: { type: Date },
    processingTime: { type: Number } // milliseconds
  },

  // Rewards
  rewards: {
    aptAmount: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    badgeAwarded: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    },
    nftMinted: { type: Boolean, default: false },
    nftTokenId: { type: String },
    nftTxHash: { type: String }
  },

  // Blockchain Transaction
  blockchain: {
    txHash: { type: String },
    txVersion: { type: Number },
    blockNumber: { type: Number },
    gasUsed: { type: Number },
    status: { type: String },
    confirmedAt: { type: Date }
  },

  // Timestamps
  startedAt: { type: Date },
  completedAt: { type: Date },
  failedAt: { type: Date },
  
  // Failure Details
  failure: {
    code: { type: String },
    reason: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    canRetry: { type: Boolean, default: true }
  },

  // Metadata
  metadata: {
    ipAddress: { type: String },
    userAgent: { type: String },
    referrer: { type: String }
  }
}, {
  timestamps: true
});

// Compound Indexes
questCompletionSchema.index({ questId: 1, userId: 1 });
questCompletionSchema.index({ userId: 1, status: 1, createdAt: -1 });
questCompletionSchema.index({ questId: 1, status: 1 });
questCompletionSchema.index({ campaignId: 1, userId: 1 });

// Virtual: Processing Duration
questCompletionSchema.virtual('processingDuration').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  return null;
});

// Method: Mark as verified
questCompletionSchema.methods.markAsCompleted = async function(verificationData, rewardsData, blockchainData) {
  this.status = 'completed';
  this.completedAt = new Date();
  
  if (verificationData) {
    this.verification = { ...this.verification, ...verificationData };
    this.verification.overallResult = VERIFICATION_RESULT.PASSED;
    this.verification.completedAt = new Date();
  }
  
  if (rewardsData) {
    this.rewards = rewardsData;
  }
  
  if (blockchainData) {
    this.blockchain = blockchainData;
  }
  
  return this.save();
};

// Method: Mark as failed
questCompletionSchema.methods.markAsFailed = async function(failureCode, reason, details = {}) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failure = {
    code: failureCode,
    reason,
    details,
    canRetry: !['ALREADY_COMPLETED', 'QUEST_EXPIRED', 'SPOOFING_DETECTED'].includes(failureCode)
  };
  this.verification.overallResult = VERIFICATION_RESULT.FAILED;
  this.verification.completedAt = new Date();
  
  return this.save();
};

export default mongoose.model('QuestCompletion', questCompletionSchema);