import axios from 'axios';

class AIVisionService {
  constructor() {
    this.geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-1.5-flash';
  }

  /**
   * Verify an image against quest requirements using Google Gemini
   */
  async verifyImage(imageBase64, questRequirements) {
    try {
      if (!this.geminiApiKey) {
        console.warn('⚠️ Google Gemini API key not configured');
        return this.getMockResponse(questRequirements);
      }

      const {
        prompt,
        requiredObjects = [],
        requireFace = false,
        requireSelfie = false,
        rejectBlurry = true,
        minimumConfidence = 0.75
      } = questRequirements;

      // Build the verification prompt
      const systemPrompt = this.buildVerificationPrompt(
        prompt,
        requiredObjects,
        requireFace,
        requireSelfie,
        rejectBlurry
      );

      console.log('🤖 Sending image to Gemini for verification...');
      console.log('📝 Prompt:', systemPrompt.substring(0, 200) + '...');

      const response = await axios.post(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: this.detectMimeType(imageBase64),
                  data: this.cleanBase64(imageBase64)
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      const result = this.parseGeminiResponse(response.data, requiredObjects, minimumConfidence);
      console.log('✅ Gemini verification complete:', result.passed ? 'PASSED' : 'FAILED');
      
      return result;

    } catch (error) {
      console.error('❌ AI Vision verification error:', error.message);
      
      if (error.response?.status === 429) {
        throw new Error('AI service rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`AI verification failed: ${error.message}`);
    }
  }

  /**
   * Build the verification prompt for Gemini
   */
  buildVerificationPrompt(customPrompt, requiredObjects, requireFace, requireSelfie, rejectBlurry) {
    let prompt = `You are a strict image verification AI for a location-based quest app. 
Analyze this image and respond ONLY with a JSON object (no markdown, no explanation).

Your task is to verify the following requirements:

`;

    if (customPrompt) {
      prompt += `MAIN REQUIREMENT: ${customPrompt}\n\n`;
    }

    if (requiredObjects.length > 0) {
      prompt += `REQUIRED OBJECTS (must ALL be clearly visible): ${requiredObjects.join(', ')}\n\n`;
    }

    if (requireFace) {
      prompt += `FACE REQUIRED: The image must contain at least one human face.\n`;
    }

    if (requireSelfie) {
      prompt += `SELFIE REQUIRED: The image must be a selfie (person facing camera, close up).\n`;
    }

    if (rejectBlurry) {
      prompt += `IMAGE QUALITY: Reject if the image is blurry, too dark, or low quality.\n`;
    }

    prompt += `
ANTI-SPOOFING CHECKS:
- Detect if this is a photo of a screen/monitor/TV
- Detect if this is a printed photo being photographed
- Check for digital manipulation artifacts

Respond with EXACTLY this JSON structure:
{
  "passed": boolean,
  "confidence": number between 0 and 1,
  "detectedObjects": [{"object": "string", "confidence": number}],
  "requiredObjectsFound": ["list of required objects that were found"],
  "requiredObjectsMissing": ["list of required objects that were NOT found"],
  "hasFace": boolean,
  "isSelfie": boolean,
  "isBlurry": boolean,
  "isScreenPhoto": boolean,
  "isPrintedPhoto": boolean,
  "isManipulated": boolean,
  "qualityScore": number between 0 and 1,
  "message": "Brief explanation of the result"
}`;

    return prompt;
  }

  /**
   * Parse Gemini's response into structured verification result
   */
  parseGeminiResponse(response, requiredObjects, minimumConfidence) {
    try {
      const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textContent) {
        throw new Error('Empty response from Gemini');
      }

      // Clean and parse JSON from response
      let jsonStr = textContent.trim();
      
      // Remove markdown code blocks if present
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const parsed = JSON.parse(jsonStr);

      // Apply our own validation logic
      let passed = parsed.passed;
      let message = parsed.message;

      // Check confidence threshold
      if (parsed.confidence < minimumConfidence) {
        passed = false;
        message = `Confidence too low (${(parsed.confidence * 100).toFixed(1)}% < ${(minimumConfidence * 100)}% required)`;
      }

      // Check for spoofing
      if (parsed.isScreenPhoto) {
        passed = false;
        message = 'Photo of a screen detected. Please take a real photo.';
      }

      if (parsed.isPrintedPhoto) {
        passed = false;
        message = 'Photo of a printed image detected. Please take a real photo.';
      }

      if (parsed.isManipulated) {
        passed = false;
        message = 'Digital manipulation detected. Please submit an unedited photo.';
      }

      // Check required objects
      if (parsed.requiredObjectsMissing?.length > 0) {
        passed = false;
        message = `Missing required elements: ${parsed.requiredObjectsMissing.join(', ')}`;
      }

      return {
        passed,
        confidence: parsed.confidence,
        detectedObjects: parsed.detectedObjects || [],
        requiredObjectsFound: parsed.requiredObjectsFound || [],
        requiredObjectsMissing: parsed.requiredObjectsMissing || [],
        hasFace: parsed.hasFace,
        isSelfie: parsed.isSelfie,
        isBlurry: parsed.isBlurry,
        spoofingDetected: parsed.isScreenPhoto || parsed.isPrintedPhoto || parsed.isManipulated,
        qualityScore: parsed.qualityScore,
        message,
        rawResponse: parsed
      };

    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError.message);
      return {
        passed: false,
        confidence: 0,
        message: 'Failed to process AI verification response',
        error: parseError.message
      };
    }
  }

  /**
   * Detect MIME type from base64 data
   */
  detectMimeType(base64Data) {
    if (base64Data.startsWith('data:image/jpeg') || base64Data.includes('/9j/')) {
      return 'image/jpeg';
    }
    if (base64Data.startsWith('data:image/png') || base64Data.includes('iVBORw0KGgo')) {
      return 'image/png';
    }
    if (base64Data.startsWith('data:image/webp')) {
      return 'image/webp';
    }
    return 'image/jpeg'; // Default
  }

  /**
   * Clean base64 string (remove data URL prefix)
   */
  cleanBase64(base64Data) {
    return base64Data.replace(/^data:image\/\w+;base64,/, '');
  }

  /**
   * Get mock response for development/testing
   */
  getMockResponse(requirements) {
    console.log('🎭 Using mock AI verification (no API key configured)');
    
    return {
      passed: true,
      confidence: 0.85,
      detectedObjects: requirements.requiredObjects?.map(obj => ({
        object: obj,
        confidence: 0.8 + Math.random() * 0.2
      })) || [],
      requiredObjectsFound: requirements.requiredObjects || [],
      requiredObjectsMissing: [],
      hasFace: requirements.requireFace ? true : null,
      isSelfie: requirements.requireSelfie ? true : null,
      isBlurry: false,
      spoofingDetected: false,
      qualityScore: 0.9,
      message: 'Mock verification passed (configure GOOGLE_GEMINI_API_KEY for real verification)',
      isMock: true
    };
  }

  /**
   * Analyze image for general content (not quest-specific)
   */
  async analyzeImage(imageBase64) {
    try {
      if (!this.geminiApiKey) {
        return { success: false, error: 'Gemini API key not configured' };
      }

      const response = await axios.post(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [
              { text: 'Describe this image in detail. Include: location, objects, people, activities, time of day, weather, and mood.' },
              {
                inline_data: {
                  mime_type: this.detectMimeType(imageBase64),
                  data: this.cleanBase64(imageBase64)
                }
              }
            ]
          }]
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const description = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      return {
        success: true,
        description,
        suggestedTags: this.extractTags(description)
      };

    } catch (error) {
      console.error('Image analysis error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract tags from description
   */
  extractTags(description) {
    if (!description) return [];
    
    const commonTags = [
      'nature', 'city', 'beach', 'mountain', 'forest', 'building', 'restaurant',
      'food', 'people', 'sunset', 'sunrise', 'night', 'day', 'water', 'landmark',
      'street', 'park', 'temple', 'church', 'museum', 'market', 'cafe'
    ];
    
    const foundTags = commonTags.filter(tag => 
      description.toLowerCase().includes(tag)
    );
    
    return foundTags.slice(0, 10);
  }
}

export default new AIVisionService();