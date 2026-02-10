// file: backEnd/src/models/SharedLink.js

import mongoose from 'mongoose';
import crypto from 'crypto';

const sharedLinkSchema = new mongoose.Schema({
  // Reference to the memory being shared
  memoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Memory',
    required: true
  },
  // Owner of the memory
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Unique share token
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Short code for easy sharing
  shortCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Expiration settings
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  // Access settings
  accessType: {
    type: String,
    enum: ['view', 'download'],
    default: 'view'
  },
  // Optional password protection
  password: {
    type: String,
    default: null
  },
  isPasswordProtected: {
    type: Boolean,
    default: false
  },
  // Access limits
  maxViews: {
    type: Number,
    default: null // null = unlimited
  },
  viewCount: {
    type: Number,
    default: 0
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  revokedAt: {
    type: Date,
    default: null
  },
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastAccessedAt: {
    type: Date,
    default: null
  },
  // Access log
  accessLog: [{
    accessedAt: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }]
}, {
  timestamps: true
});

// Generate unique token
sharedLinkSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Generate short code (8 characters)
sharedLinkSchema.statics.generateShortCode = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Check if link is valid
sharedLinkSchema.methods.isValid = function() {
  // Check if revoked
  if (this.isRevoked || !this.isActive) {
    return { valid: false, reason: 'Link has been revoked' };
  }
  
  // Check expiration
  if (new Date() > this.expiresAt) {
    return { valid: false, reason: 'Link has expired' };
  }
  
  // Check view limit
  if (this.maxViews !== null && this.viewCount >= this.maxViews) {
    return { valid: false, reason: 'Maximum views reached' };
  }
  
  return { valid: true };
};

// Record access
sharedLinkSchema.methods.recordAccess = async function(ipAddress, userAgent) {
  this.viewCount += 1;
  this.lastAccessedAt = new Date();
  this.accessLog.push({
    accessedAt: new Date(),
    ipAddress,
    userAgent
  });
  
  // Keep only last 100 access logs
  if (this.accessLog.length > 100) {
    this.accessLog = this.accessLog.slice(-100);
  }
  
  await this.save();
};

// Virtual for remaining time
sharedLinkSchema.virtual('remainingTime').get(function() {
  const now = new Date();
  const remaining = this.expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
});

// Indexes for cleanup job
sharedLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model('SharedLink', sharedLinkSchema);