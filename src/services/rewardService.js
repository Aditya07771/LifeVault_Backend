import aptosService from './aptosService.js';
import User from '../models/User.js';
import Badge from '../models/Badge.js';

class RewardService {
  
  /**
   * Process rewards for a completed quest
   */
  async processQuestRewards(userId, quest, questCompletion) {
    const results = {
      apt: null,
      points: null,
      badge: null,
      nft: null,
      xp: null,
      level: null,
      errors: []
    };

    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // 1. APT Rewards
      if (quest.rewards.aptAmount > 0) {
        results.apt = await this.sendAptReward(
          user.aptosAddress,
          quest.rewards.aptAmount,
          quest._id
        );
      }

      // 2. Points
      if (quest.rewards.points > 0) {
        results.points = await this.addPoints(user, quest.rewards.points);
      }

      // 3. Badge
      if (quest.rewards.badgeId) {
        results.badge = await this.awardBadge(user, quest.rewards.badgeId, questCompletion._id);
      }

      // 4. NFT (if enabled)
      if (quest.rewards.nftMetadata?.enabled) {
        results.nft = await this.mintQuestNFT(user, quest, questCompletion);
      }

      // 5. XP (base XP based on difficulty)
      const xpReward = this.calculateXP(quest);
      results.xp = await user.addXP(xpReward);

      // 6. Update streak
      await user.updateStreak();

      // 7. Update quest stats
      await this.updateUserQuestStats(user, quest.rewards.aptAmount, quest.rewards.points);

      // 8. Update quest budget
      await this.updateQuestBudget(quest, quest.rewards.aptAmount);

      return results;

    } catch (error) {
      console.error('Reward processing error:', error);
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Send APT reward to user
   */
  async sendAptReward(userAddress, amount, questId) {
    try {
      if (!userAddress) {
        return { success: false, error: 'No wallet address' };
      }

      console.log(`💰 Sending ${amount} APT to ${userAddress}`);

      // Use the sponsored transaction approach
      const result = await aptosService.sendReward(userAddress, amount);

      return {
        success: true,
        amount,
        txHash: result.txHash,
        txVersion: result.txVersion
      };

    } catch (error) {
      console.error('APT reward error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add points to user
   */
  async addPoints(user, points) {
    await user.addPoints(points);
    return {
      success: true,
      pointsAdded: points,
      newBalance: user.points.current
    };
  }

  /**
   * Award badge to user
   */
  async awardBadge(user, badgeId, questCompletionId) {
    try {
      const badge = await Badge.findById(badgeId);
      if (!badge) {
        return { success: false, error: 'Badge not found' };
      }

      // Check if already has badge
      if (user.badges.some(b => b.badgeId.toString() === badgeId.toString())) {
        return { success: false, error: 'Already has badge' };
      }

      // Add badge to user
      user.badges.push({
        badgeId,
        awardedAt: new Date(),
        questCompletionId
      });
      await user.save();

      // Update badge stats
      badge.stats.totalAwarded += 1;
      badge.stats.uniqueHolders += 1;
      await badge.save();

      return {
        success: true,
        badge: {
          id: badge._id,
          name: badge.name,
          rarity: badge.rarity,
          imageUrl: badge.imageUrl
        }
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mint NFT for quest completion
   */
  async mintQuestNFT(user, quest, questCompletion) {
    try {
      // This would integrate with Aptos NFT minting
      // For now, we'll return a placeholder
      console.log(`🎨 Minting NFT for user ${user._id}`);

      const nftMetadata = quest.rewards.nftMetadata;

      // TODO: Implement actual Aptos NFT minting
      // const result = await aptosService.mintNFT(
      //   user.aptosAddress,
      //   nftMetadata.name,
      //   nftMetadata.description,
      //   nftMetadata.imageUrl,
      //   nftMetadata.attributes
      // );

      return {
        success: true,
        nftName: nftMetadata.name,
        message: 'NFT minting queued (implementation pending)'
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate XP based on quest difficulty
   */
  calculateXP(quest) {
    const baseXP = {
      easy: 25,
      medium: 50,
      hard: 100,
      expert: 200
    };

    let xp = baseXP[quest.difficulty] || 25;

    // Bonus for first completion of the day
    xp += 10;

    // Bonus for using multiple verification layers
    if (quest.verificationLayers?.length > 2) {
      xp += 25;
    }

    return xp;
  }

  /**
   * Update user's quest statistics
   */
  async updateUserQuestStats(user, aptEarned, pointsEarned) {
    user.questStats.totalCompleted += 1;
    user.questStats.totalPointsEarned += pointsEarned || 0;
    user.questStats.totalAptEarned += aptEarned || 0;
    user.questStats.lastCompletedAt = new Date();
    await user.save();
  }

  /**
   * Update quest budget after reward distribution
   */
  async updateQuestBudget(quest, aptReward) {
    if (aptReward > 0) {
      quest.budget.aptRemaining -= aptReward;
    }
    quest.stats.totalCompletions += 1;
    quest.stats.totalRewardsDistributed += aptReward || 0;
    await quest.save();
  }

  /**
   * Process campaign grand prize
   */
  async processCampaignCompletion(userId, campaign) {
    const results = {
      success: false,
      rewards: {}
    };

    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const grandPrize = campaign.grandPrize;

      if (grandPrize.aptAmount > 0) {
        results.rewards.apt = await this.sendAptReward(
          user.aptosAddress,
          grandPrize.aptAmount,
          campaign._id
        );
      }

      if (grandPrize.points > 0) {
        results.rewards.points = await this.addPoints(user, grandPrize.points);
      }

      if (grandPrize.badgeId) {
        results.rewards.badge = await this.awardBadge(user, grandPrize.badgeId, null);
      }

      // Update campaign stats
      campaign.stats.totalCompletions += 1;
      await campaign.save();

      results.success = true;
      return results;

    } catch (error) {
      results.error = error.message;
      return results;
    }
  }
}

export default new RewardService();