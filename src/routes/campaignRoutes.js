// src/routes/campaignRoutes.js

import express from 'express';
import {
  createCampaign,
  getCampaigns,
  getCampaign,
  joinCampaign,
  checkCampaignCompletion,
  getCampaignLeaderboard,
  addQuestToCampaign,
  removeQuestFromCampaign,
  updateCampaignStatus,
  getMyCampaigns,
  getCampaignStats,
  updateCampaign,
  deleteCampaign
} from '../controllers/campaignController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getCampaigns);
router.get('/:id', optionalAuth, getCampaign);
router.get('/:id/leaderboard', getCampaignLeaderboard);

// Protected routes
router.use(protect);

router.post('/', createCampaign);
router.get('/user/my-campaigns', getMyCampaigns);

router.post('/:id/join', joinCampaign);
router.post('/:id/check-completion', checkCampaignCompletion);
router.post('/:id/quests', addQuestToCampaign);
router.delete('/:id/quests/:questId', removeQuestFromCampaign);

router.patch('/:id/status', updateCampaignStatus);
router.get('/:id/stats', getCampaignStats);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);

export default router;