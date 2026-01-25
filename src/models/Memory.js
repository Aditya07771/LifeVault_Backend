import mongoose from 'mongoose';


const memorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    enum: ['document', 'photo', 'video', 'audio', 'other'],
    default: 'other'
  },
  // IPFS Data
  ipfsHash: {
    type: String,
    required: [true, 'IPFS hash is required']
  },
  ipfsUrl: {
    type: String
  },
  // Blockchain Data
  txHash: {
    type: String,
    default: null
  },
  blockNumber: {
    type: Number,
    default: null
  },
  isOnChain: {
    type: Boolean,
    default: false
  },
  // File Metadata
  fileType: {
    type: String
  },
  fileSize: {
    type: Number
  },
  fileName: {
    type: String
  },
  // Encryption
  isEncrypted: {
    type: Boolean,
    default: true
  },
  encryptionMethod: {
    type: String,
    default: 'AES-256-GCM'
  },
  // Sharing
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['view', 'download'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Inheritance (Future Feature)
  inheritanceEnabled: {
    type: Boolean,
    default: false
  },
  beneficiaries: [{
    email: String,
    walletAddress: String,
    relationship: String
  }],
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
memorySchema.index({ userId: 1, createdAt: -1 });
memorySchema.index({ ipfsHash: 1 });
memorySchema.index({ txHash: 1 });

// Virtual for IPFS Gateway URL
memorySchema.virtual('gatewayUrl').get(function() {
  return `https://gateway.pinata.cloud/ipfs/${this.ipfsHash}`;
});

// Pre-save middleware
memorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// module.exports = mongoose.model('Memory', memorySchema);
export default mongoose.model('Memory', memorySchema);
