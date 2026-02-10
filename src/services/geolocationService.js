class GeolocationService {
  
  /**
   * Calculate distance between two points using Haversine formula
   * @returns Distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = this.toRadians(lat1);
    const φ2 = this.toRadians(lat2);
    const Δφ = this.toRadians(lat2 - lat1);
    const Δλ = this.toRadians(lon2 - lon1);

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Check if a point is within a radius of another point
   */
  isWithinRadius(userLat, userLon, targetLat, targetLon, radiusMeters) {
    const distance = this.calculateDistance(userLat, userLon, targetLat, targetLon);
    return {
      isWithin: distance <= radiusMeters,
      distance: Math.round(distance),
      radiusMeters
    };
  }

  /**
   * Calculate bounding box for a center point and radius
   * Useful for database queries
   */
  getBoundingBox(lat, lon, radiusMeters) {
    const latDelta = (radiusMeters / 111320); // 1 degree lat ≈ 111.32 km
    const lonDelta = (radiusMeters / (111320 * Math.cos(this.toRadians(lat))));

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta
    };
  }

  /**
   * Get bearing between two points
   */
  getBearing(lat1, lon1, lat2, lon2) {
    const φ1 = this.toRadians(lat1);
    const φ2 = this.toRadians(lat2);
    const Δλ = this.toRadians(lon2 - lon1);

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const bearing = Math.atan2(y, x);
    return (this.toDegrees(bearing) + 360) % 360;
  }

  /**
   * Convert radians to degrees
   */
  toDegrees(radians) {
    return radians * (180 / Math.PI);
  }

  /**
   * Get compass direction from bearing
   */
  getDirection(bearing) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  /**
   * Format distance for display
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * Validate coordinates
   */
  isValidCoordinates(lat, lon) {
    return (
      typeof lat === 'number' && 
      typeof lon === 'number' &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    );
  }

  /**
   * Get nearby locations from a list
   */
  findNearby(userLat, userLon, locations, maxDistanceMeters) {
    return locations
      .map(location => {
        const [lon, lat] = location.coordinates.coordinates;
        const distance = this.calculateDistance(userLat, userLon, lat, lon);
        return { ...location.toObject(), distance };
      })
      .filter(loc => loc.distance <= maxDistanceMeters)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Verify a user's submitted location against a target location
   * Used by VerificationService (quests + story unlocks)
   *
   * @param {{ latitude:number, longitude:number, accuracy?:number }} submittedLocation
   * @param {{ coordinates:[number,number], radiusMeters:number }} targetLocation
   */
  verifyLocation(submittedLocation, targetLocation) {
    try {
      const userLat = submittedLocation?.latitude;
      const userLon = submittedLocation?.longitude;

      if (typeof userLat !== 'number' || typeof userLon !== 'number') {
        return {
          passed: false,
          withinRadius: false,
          distanceMeters: null,
          allowedRadius: targetLocation?.radiusMeters || null,
          message: 'Location data not provided'
        };
      }

      const coords = targetLocation?.coordinates;
      const allowedRadius = Math.max(10, Number(targetLocation?.radiusMeters || 50));

      if (!Array.isArray(coords) || coords.length !== 2) {
        return {
          passed: false,
          withinRadius: false,
          distanceMeters: null,
          allowedRadius,
          message: 'Quest target location not configured'
        };
      }

      // targetLocation.coordinates is [lng, lat]
      const targetLon = Number(coords[0]);
      const targetLat = Number(coords[1]);

      if (!this.isValidCoordinates(userLat, userLon) || !this.isValidCoordinates(targetLat, targetLon)) {
        return {
          passed: false,
          withinRadius: false,
          distanceMeters: null,
          allowedRadius,
          message: 'Invalid coordinates'
        };
      }

      const distanceMeters = Math.round(this.calculateDistance(userLat, userLon, targetLat, targetLon));
      const withinRadius = distanceMeters <= allowedRadius;

      return {
        passed: withinRadius,
        withinRadius,
        distanceMeters,
        allowedRadius,
        message: withinRadius
          ? `✅ Location verified (${distanceMeters}m away)`
          : `❌ Location mismatch (${distanceMeters}m away, allowed ${allowedRadius}m)`
      };
    } catch (e) {
      return {
        passed: false,
        withinRadius: false,
        distanceMeters: null,
        allowedRadius: targetLocation?.radiusMeters || null,
        message: e?.message || 'Location verification failed'
      };
    }
  }

  /**
   * Simple anti-spoofing detection hook (optional).
   * If deviceInfo is not provided, callers usually skip this anyway.
   */
  detectSpoofing(deviceInfo) {
    const checks = [];
    let riskScore = 0;

    if (!deviceInfo) {
      return { passed: true, checks, riskScore: 0 };
    }

    // Basic heuristics (safe defaults)
    if (deviceInfo.isEmulator) {
      checks.push({ check: 'isEmulator', passed: false, details: 'Device reports emulator' });
      riskScore += 0.6;
    } else {
      checks.push({ check: 'isEmulator', passed: true, details: 'Not an emulator' });
    }

    if (deviceInfo.isMockLocation) {
      checks.push({ check: 'mockLocation', passed: false, details: 'Mock location enabled' });
      riskScore += 0.6;
    } else {
      checks.push({ check: 'mockLocation', passed: true, details: 'Mock location not detected' });
    }

    riskScore = Math.min(1, riskScore);
    return { passed: riskScore <= 0.5, checks, riskScore };
  }
}

export default new GeolocationService();