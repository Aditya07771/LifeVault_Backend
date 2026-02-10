// Quest Types
export const QUEST_TYPES = {
  LOCATION: 'location',
  TIME_WINDOW: 'time_window',
  QR_CODE: 'qr_code',
  AI_VERIFIED: 'ai_verified',
  TWIN_LOCK: 'twin_lock', // Combination of multiple types
  STORY_CHAPTER: 'story_chapter'
};

// Verification Layers
export const VERIFICATION_LAYERS = {
  GPS: 'gps',
  TIME: 'time',
  AI_VISION: 'ai_vision',
  QR_SCAN: 'qr_scan',
  NFC: 'nfc'
};

// Quest Status
export const QUEST_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  EXPIRED: 'expired'
};

// Campaign Types
export const CAMPAIGN_TYPES = {
  TOURISM: 'tourism',
  LOYALTY: 'loyalty',
  MARKETING: 'marketing',
  SCAVENGER_HUNT: 'scavenger_hunt',
  PERSONAL: 'personal'
};

// Badge Rarities
export const BADGE_RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary'
};

// Verification Results
export const VERIFICATION_RESULT = {
  PASSED: 'passed',
  FAILED: 'failed',
  PENDING: 'pending',
  PARTIAL: 'partial'
};

// Error Codes
export const ERROR_CODES = {
  LOCATION_MISMATCH: 'E001',
  TIME_WINDOW_CLOSED: 'E002',
  AI_VERIFICATION_FAILED: 'E003',
  QR_CODE_INVALID: 'E004',
  ALREADY_COMPLETED: 'E005',
  QUEST_EXPIRED: 'E006',
  INSUFFICIENT_FUNDS: 'E007',
  PHOTO_TOO_BLURRY: 'E008',
  SPOOFING_DETECTED: 'E009'
};

// Default Settings
export const DEFAULTS = {
  GPS_RADIUS_METERS: 50,
  MAX_PHOTO_SIZE_MB: 10,
  AI_CONFIDENCE_THRESHOLD: 0.75,
  QUEST_EXPIRY_DAYS: 30,
  MAX_DAILY_COMPLETIONS: 10
};

export default {
  QUEST_TYPES,
  VERIFICATION_LAYERS,
  QUEST_STATUS,
  CAMPAIGN_TYPES,
  BADGE_RARITY,
  VERIFICATION_RESULT,
  ERROR_CODES,
  DEFAULTS
};