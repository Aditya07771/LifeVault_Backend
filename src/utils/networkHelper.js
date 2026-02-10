// file: backEnd/src/utils/networkHelper.js

import os from 'os';

/**
 * Get your machine's local network IP (e.g., 192.168.1.42)
 * This IP is accessible by all devices on the same WiFi/LAN
 */
export function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Pick the first non-internal IPv4 address
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'localhost'; // fallback if no network found
}

/**
 * Build the correct base URL
 * - Uses FRONTEND_URL from .env if set
 * - Otherwise auto-detects your network IP
 */
export function getBaseUrl(req = null) {
  // 1. If env is set AND it's not localhost, use it
  if (
    process.env.FRONTEND_URL &&
    !process.env.FRONTEND_URL.includes('localhost')
  ) {
    return process.env.FRONTEND_URL;
  }

  // 2. Try to detect from the incoming request
  if (req) {
    // If user is already accessing via IP, use that same IP
    if (req.headers.origin && !req.headers.origin.includes('localhost')) {
      return req.headers.origin;
    }

    // Extract from host header
    if (req.headers.host && !req.headers.host.includes('localhost')) {
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https'
        ? 'https'
        : 'http';
      const host = req.headers.host;
      const backendPort = String(process.env.PORT || 5000);
      const frontendPort = String(process.env.FRONTEND_PORT || 5173);

      // Replace backend port with frontend port
      const adjustedHost = host.includes(`:${backendPort}`)
        ? host.replace(`:${backendPort}`, `:${frontendPort}`)
        : host;

      return `${protocol}://${adjustedHost}`;
    }
  }

  // 3. Auto-detect: use network IP instead of localhost
  const ip = getLocalNetworkIP();
  const frontendPort = process.env.FRONTEND_PORT || 5173;

  return `http://${ip}:${frontendPort}`;
}