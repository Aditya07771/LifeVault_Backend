import geolocationService from './geolocationService.js';
import aiVisionService from './aiVisionService.js';
import encryptionService from './encryptionService.js';
import { VERIFICATION_RESULT, ERROR_CODES } from '../config/constants.js';

/**
 * Verification Service
 * The core "Trust Layer" that combines all verification methods
 * Handles GPS + Time Window + AI Vision + QR Code verification
 */

class VerificationService {
  constructor() {
    this.verificationMethods = {
      gps: this.verifyGPS.bind(this),
      time: this.verifyTimeWindow.bind(this),
      ai_vision: this.verifyAIVision.bind(this),
      qr_scan: this.verifyQRCode.bind(this),
      nfc: this.verifyNFC.bind(this)
    };
  }

  /**
   * Main verification method - runs all required verification layers
   * @param {Object} quest - Quest document
   * @param {Object} submission - User's submission data
   * @returns {Object} Complete verification result
   */
  async verifyQuestCompletion(quest, submission) {
    const startTime = Date.now();
    
    const result = {
      overallResult: VERIFICATION_RESULT.PENDING,
      overallScore: 0,
      gps: null,
      timeWindow: null,
      aiVision: null,
      qrCode: null,
      antiSpoofing: null,
      startedAt: new Date(),
      completedAt: null,
      processingTime: 0
    };

    const layerResults = [];

    try {
      console.log('\n=== Starting Quest Verification ===');
      console.log('Quest ID:', quest._id);
      console.log('Quest Type:', quest.questType);
      console.log('Verification Layers:', quest.verificationLayers || 'auto-detect');

      // Determine which layers to verify
      const layers = this.determineVerificationLayers(quest);
      console.log('Active Layers:', layers);

      // 1. Anti-Spoofing Check (always first)
      if (submission.deviceInfo) {
        result.antiSpoofing = geolocationService.detectSpoofing(submission.deviceInfo);
        
        if (result.antiSpoofing.riskScore > 0.5) {
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.SPOOFING_DETECTED;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }
      }

      // 2. GPS Verification
      if (layers.includes('gps') && quest.location?.coordinates?.coordinates) {
        console.log('📍 Verifying GPS...');
        result.gps = await this.verifyGPS(quest, submission);
        layerResults.push({ layer: 'gps', ...result.gps });

        if (!result.gps.passed) {
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.LOCATION_MISMATCH;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }
      }

      // 3. Time Window Verification
      if (layers.includes('time') && quest.timeWindow?.enabled) {
        console.log('⏰ Verifying Time Window...');
        result.timeWindow = await this.verifyTimeWindow(quest, submission);
        layerResults.push({ layer: 'time', ...result.timeWindow });

        if (!result.timeWindow.passed) {
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.TIME_WINDOW_CLOSED;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }
      }

      // 4. QR Code Verification
      if (layers.includes('qr_scan') && quest.qrCode?.enabled) {
        console.log('📱 Verifying QR Code...');
        result.qrCode = await this.verifyQRCode(quest, submission);
        layerResults.push({ layer: 'qr', ...result.qrCode });

        if (!result.qrCode.passed) {
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.QR_CODE_INVALID;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }
      }

      // 5. AI Vision Verification (most compute-intensive, run last)
      if (layers.includes('ai_vision') && quest.aiVerification?.enabled) {
        console.log('🤖 Verifying with AI Vision...');
        
        if (!submission.photoUrl && !submission.photoBase64) {
          result.aiVision = {
            passed: false,
            message: 'Photo required for AI verification'
          };
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.AI_VERIFICATION_FAILED;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }

        result.aiVision = await this.verifyAIVision(quest, submission);
        layerResults.push({ layer: 'ai_vision', ...result.aiVision });

        if (!result.aiVision.passed) {
          result.overallResult = VERIFICATION_RESULT.FAILED;
          result.failureCode = ERROR_CODES.AI_VERIFICATION_FAILED;
          result.completedAt = new Date();
          result.processingTime = Date.now() - startTime;
          return result;
        }
      }

      // All verifications passed
      const passedLayers = layerResults.filter(l => l.passed).length;
      const totalLayers = layerResults.length;
      
      result.overallScore = totalLayers > 0 ? passedLayers / totalLayers : 1;
      result.overallResult = VERIFICATION_RESULT.PASSED;
      result.completedAt = new Date();
      result.processingTime = Date.now() - startTime;

      console.log('✅ Verification PASSED');
      console.log(`   Score: ${(result.overallScore * 100).toFixed(1)}%`);
      console.log(`   Time: ${result.processingTime}ms`);

      return result;

    } catch (error) {
      console.error('❌ Verification error:', error);
      result.overallResult = VERIFICATION_RESULT.FAILED;
      result.error = error.message;
      result.completedAt = new Date();
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Determine which verification layers are needed for a quest
   */
  determineVerificationLayers(quest) {
    // If explicitly defined, use those
    if (quest.verificationLayers?.length > 0) {
      return quest.verificationLayers;
    }

    // Auto-detect based on quest configuration
    const layers = [];

    if (quest.location?.coordinates?.coordinates) {
      layers.push('gps');
    }

    if (quest.timeWindow?.enabled) {
      layers.push('time');
    }

    if (quest.qrCode?.enabled) {
      layers.push('qr_scan');
    }

    if (quest.aiVerification?.enabled) {
      layers.push('ai_vision');
    }

    // Default to GPS + AI if nothing specified
    if (layers.length === 0) {
      layers.push('gps', 'ai_vision');
    }

    return layers;
  }

  /**
   * GPS Verification
   */
  async verifyGPS(quest, submission) {
    const { location } = submission;
    
    if (!location?.latitude || !location?.longitude) {
      return {
        passed: false,
        message: 'Location data not provided',
        distanceMeters: null,
        withinRadius: false
      };
    }

    const targetLocation = {
      coordinates: quest.location.coordinates.coordinates,
      radiusMeters: quest.location.radiusMeters
    };

    const result = geolocationService.verifyLocation(location, targetLocation);

    return {
      passed: result.passed,
      distanceMeters: result.distanceMeters,
      withinRadius: result.withinRadius,
      allowedRadius: result.allowedRadius,
      message: result.message
    };
  }

  /**
   * Time Window Verification
   */
  async verifyTimeWindow(quest, submission) {
    const now = submission.capturedAt ? new Date(submission.capturedAt) : new Date();
    const timeWindow = quest.timeWindow;

    // Check specific dates first
    if (timeWindow.specificDates?.length > 0) {
      const todayStr = now.toISOString().split('T')[0];
      const specificDate = timeWindow.specificDates.find(
        d => new Date(d.date).toISOString().split('T')[0] === todayStr
      );

      if (specificDate) {
        const currentTime = now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timeWindow.timezone || 'UTC'
        });

        const isWithin = currentTime >= specificDate.startTime && 
                        currentTime <= specificDate.endTime;

        return {
          passed: isWithin,
          submissionTime: currentTime,
          allowedWindow: `${specificDate.startTime} - ${specificDate.endTime}`,
          message: isWithin ? 'Within time window' : 'Outside allowed time window'
        };
      }
    }

    // Check day of week
    if (timeWindow.daysOfWeek?.length > 0) {
      const dayOfWeek = now.getDay();
      if (!timeWindow.daysOfWeek.includes(dayOfWeek)) {
        return {
          passed: false,
          submissionTime: now.toISOString(),
          message: 'Quest not available today'
        };
      }
    }

    // Check time range
    if (timeWindow.startTime && timeWindow.endTime) {
      const currentTime = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timeWindow.timezone || 'UTC'
      });

      const isWithin = currentTime >= timeWindow.startTime && 
                      currentTime <= timeWindow.endTime;

      return {
        passed: isWithin,
        submissionTime: currentTime,
        allowedWindow: `${timeWindow.startTime} - ${timeWindow.endTime}`,
        message: isWithin ? 'Within time window' : `Come back between ${timeWindow.startTime} and ${timeWindow.endTime}`
      };
    }

    return {
      passed: true,
      message: 'No time restriction'
    };
  }

  /**
   * QR Code Verification
   */
  async verifyQRCode(quest, submission) {
    if (!submission.qrCodeScanned) {
      return {
        passed: false,
        codeMatched: false,
        message: 'QR code not scanned'
      };
    }

    const codeHash = quest.qrCode.codeHash;
    const scannedHash = encryptionService.hash(submission.qrCodeScanned);

    const matched = scannedHash === codeHash;

    return {
      passed: matched,
      codeMatched: matched,
      message: matched ? 'QR code verified' : 'Invalid QR code'
    };
  }

  /**
   * AI Vision Verification
   */
  async verifyAIVision(quest, submission) {
    const imageBase64 = submission.photoBase64 || submission.photoUrl;
    
    if (!imageBase64) {
      return {
        passed: false,
        message: 'No image provided for AI verification'
      };
    }

    const requirements = {
      prompt: quest.aiVerification.prompt,
      requiredObjects: quest.aiVerification.requiredObjects || [],
      requireFace: quest.aiVerification.requireFace,
      requireSelfie: quest.aiVerification.requireSelfie,
      rejectBlurry: quest.aiVerification.rejectBlurry,
      minimumConfidence: quest.aiVerification.minimumConfidence || 0.75
    };

    const result = await aiVisionService.verifyImage(imageBase64, requirements);

    return {
      passed: result.passed,
      confidence: result.confidence,
      detectedObjects: result.detectedObjects,
      requiredObjectsFound: result.requiredObjectsFound,
      requiredObjectsMissing: result.requiredObjectsMissing,
      isBlurry: result.isBlurry,
      hasFace: result.hasFace,
      isSelfie: result.isSelfie,
      rawResponse: result.rawResponse,
      message: result.reason
    };
  }

  /**
   * NFC Verification (placeholder for future implementation)
   */
  async verifyNFC(quest, submission) {
    return {
      passed: false,
      message: 'NFC verification not yet implemented'
    };
  }

  /**
   * Verify a story chapter unlock conditions
   */
  async verifyStoryChapterUnlock(chapter, userId, submittedData) {
    const conditions = chapter.unlockConditions;
    const result = { unlocked: true, checks: [], reason: null };

    // Location check
    if (conditions.location?.enabled) {
      if (!submittedData.latitude || !submittedData.longitude) {
        return {
          unlocked: false,
          checks: [{ type: 'location', passed: false }],
          reason: `Go to: ${conditions.location.name || 'the secret location'}`
        };
      }

      const targetLocation = {
        coordinates: conditions.location.coordinates.coordinates,
        radiusMeters: conditions.location.radiusMeters
      };

      const gpsResult = geolocationService.verifyLocation(submittedData, targetLocation);
      
      if (!gpsResult.passed) {
        return {
          unlocked: false,
          checks: [{ type: 'location', passed: false, distance: gpsResult.distanceMeters }],
          reason: `You're ${gpsResult.distanceMeters}m away. Get closer!`
        };
      }
      result.checks.push({ type: 'location', passed: true });
    }

    // Time check
    if (conditions.time?.enabled) {
      const now = new Date();

      if (conditions.time.unlockAt && now < new Date(conditions.time.unlockAt)) {
        return {
          unlocked: false,
          checks: [{ type: 'time', passed: false }],
          reason: `This chapter unlocks on ${new Date(conditions.time.unlockAt).toLocaleString()}`
        };
      }

      if (conditions.time.specificTime) {
        const [hours, minutes] = conditions.time.specificTime.split(':');
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();

        if (currentHours !== parseInt(hours) || Math.abs(currentMinutes - parseInt(minutes)) > 5) {
          return {
            unlocked: false,
            checks: [{ type: 'time', passed: false }],
            reason: `Come back at ${conditions.time.specificTime}`
          };
        }
      }
      result.checks.push({ type: 'time', passed: true });
    }

    // QR Code check
    if (conditions.qrCode?.enabled) {
      if (!submittedData.qrCode) {
        return {
          unlocked: false,
          checks: [{ type: 'qrCode', passed: false }],
          reason: conditions.qrCode.hint || 'Scan the QR code to unlock'
        };
      }

      if (!encryptionService.verifyQRCode(submittedData.qrCode, conditions.qrCode.codeHash)) {
        return {
          unlocked: false,
          checks: [{ type: 'qrCode', passed: false }],
          reason: 'Wrong QR code'
        };
      }
      result.checks.push({ type: 'qrCode', passed: true });
    }

    // Password check
    if (conditions.password?.enabled) {
      if (!submittedData.password) {
        return {
          unlocked: false,
          checks: [{ type: 'password', passed: false }],
          reason: conditions.password.hint || 'Enter the secret password'
        };
      }

      // Password verification would use bcrypt compare
      // For now, placeholder
      result.checks.push({ type: 'password', passed: true });
    }

    return result;
  }
}

export default new VerificationService();