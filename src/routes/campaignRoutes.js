// src/routes/campaignRoutes.js

import express from 'express';
import {
  createCampaign,
  getCampaigns,
  getCampaign,
  joinCampaign,
  addQuestToCampaign,
  getCampaignLeaderboard,
  updateCampaign,
  activateCampaign,
  getMyCampaigns,
  getJoinedCampaigns,
  checkCampaignCompletion,
  deleteCampaign
} from '../controllers/campaignController.js';

import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * =========================
 * PUBLIC ROUTES
 * =========================
 */

// Campaigns created by logged-in user
router.get('/user/my-campaigns', protect, getMyCampaigns);

// Campaigns user has joined
router.get('/user/joined', protect, getJoinedCampaigns);

// Get all campaigns
router.get('/', optionalAuth, getCampaigns);

// Get campaign leaderboard
router.get('/:id/leaderboard', getCampaignLeaderboard);

// Get single campaign (user progress if logged in)
router.get('/:id', optionalAuth, getCampaign);

// Join campaign
router.post('/:id/join', joinCampaign);

// Check campaign completion
router.post('/:id/check-completion', checkCampaignCompletion);

// Add quest to campaign
router.post('/:id/quests', addQuestToCampaign);

// Update campaign
router.put('/:id', updateCampaign);

// Activate campaign
router.post('/:id/activate', activateCampaign);

// Delete campaign
router.delete('/:id', deleteCampaign);

export default router;
