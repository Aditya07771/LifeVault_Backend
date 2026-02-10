
import axios from 'axios';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

let authToken = '';
let userId = '';
let memoryId = '';
let questId = '';
let campaignId = '';
let badgeId = '';
let storyId = '';
let shareShortCode = '';

const testUser = {
    email: `test_${Date.now()}@example.com`,
    password: 'password123',
    name: 'Test User'
};

const axiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    validateStatus: () => true, // Don't throw on error status
});

const log = (msg, type = 'INFO') => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] [${type}] ${msg}`;
    console.log(logMsg);
    fs.appendFileSync('test_results.log', logMsg + '\n');
};

const runTest = async (name, method, url, data = null, headers = {}) => {
    log(`Testing ${name} (${method} ${url})...`);
    try {
        const config = {
            method,
            url,
            data,
            headers: { ...headers }
        };

        if (authToken) {
            config.headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await axiosInstance(config);

        if (response.status >= 200 && response.status < 300) {
            log(`${name} PASSED (${response.status})`, 'SUCCESS');
            return response.data;
        } else {
            log(`${name} FAILED (${response.status})`, 'ERROR');
            log(`Response: ${JSON.stringify(response.data, null, 2)}`, 'ERROR');
            return null;
        }
    } catch (error) {
        log(`${name} CRASHED: ${error.message}`, 'ERROR');
        return null;
    }
};

const main = async () => {
    log('Starting Backend API Tests...');

    // 1. Health Check
    await runTest('Health Check', 'GET', BASE_URL + '/health');

    // 2. Auth
    const registerRes = await runTest('Register User', 'POST', '/auth/register', testUser);
    if (registerRes && registerRes.success) {
        authToken = registerRes.data.token;
        userId = registerRes.data.user.id;
        log(`User registered with ID: ${userId}`);
    } else {
        // Try login if register failed (maybe user exists from previous run)
        const loginRes = await runTest('Login User', 'POST', '/auth/login', {
            email: testUser.email,
            password: testUser.password
        });
        if (loginRes && loginRes.success) {
            authToken = loginRes.data.token;
            userId = loginRes.data.user.id;
            log(`User logged in with ID: ${userId}`);
        } else {
            log('Auth failed, aborting rest of tests', 'FATAL');
            return;
        }
    }

    await runTest('Get Me', 'GET', '/auth/me');

    // 3. Memories
    const memoryData = {
        title: 'Test Memory',
        description: 'This is a test memory',
        category: 'other', // Corrected enum value
        fileData: Buffer.from('Test File Content').toString('base64'),
        fileName: 'test.txt',
        fileType: 'text/plain',
        storeOnChain: false
    };

    const createMemoryRes = await runTest('Create Memory', 'POST', '/memories', memoryData);
    if (createMemoryRes && createMemoryRes.success) {
        memoryId = createMemoryRes.data.memory._id;
        log(`Memory created with ID: ${memoryId}`);
    }

    await runTest('List Memories', 'GET', '/memories');

    if (memoryId) {
        await runTest('Get Memory', 'GET', `/memories/${memoryId}`);

        // 4. Share
        const shareRes = await runTest('Create Share Link', 'POST', '/share', {
            memoryId,
            duration: '24h',
            accessType: 'view'
        });

        if (shareRes && shareRes.success) {
            shareShortCode = shareRes.data.shortCode;
            log(`Share link created with code: ${shareShortCode}`);

            await runTest('Verify Share Link', 'GET', `/share/${shareShortCode}/verify`);
        }

        await runTest('Get My Share Links', 'GET', '/share/user/my-links');
    }

    // 5. Quests
    const questData = {
        title: "Test Quest",
        description: "A test quest",
        questType: "location", // Added required field
        location: {
            coordinates: { // Nested coordinates as per schema
                type: "Point",
                coordinates: [0, 0]
            }
        },
        rewards: {
            points: 100 // changed xp to points as per schema rewards.points
        }
    };
    const createQuestRes = await runTest('Create Quest', 'POST', '/quests', questData);
    if (createQuestRes && createQuestRes.success) {
        questId = createQuestRes.data._id || createQuestRes.data.quest?._id || (createQuestRes.data.data ? createQuestRes.data.data.quest._id : null);
        // Note: questController returns { success: true, message: '...', data: quest } usually, inside createQuest it returns just data: campaign for campaign?
        // createQuest returns just `res.json({ success: true, message: '...', data: quest })`? 
        // Actually `createQuest` had `res.status(201).json({...})` but let's check exact return. 
        // It returns `data: quest`.
        if (!questId && createQuestRes.data && createQuestRes.data._id) questId = createQuestRes.data._id;

        log(`Quest created with ID: ${questId}`);
    }

    await runTest('List Quests', 'GET', '/quests');

    if (questId) {
        await runTest('Get Quest', 'GET', `/quests/${questId}`);
    }

    // 6. Campaigns
    const campaignData = {
        name: "Test Campaign", // Changed title to name
        description: "A test campaign",
        campaignType: "personal", // Corrected enum
        organizationType: "brand", // Added required field
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
    };
    const createCampaignRes = await runTest('Create Campaign', 'POST', '/campaigns', campaignData);
    if (createCampaignRes && createCampaignRes.success) {
        campaignId = createCampaignRes.data._id || createCampaignRes.data.campaign?._id;
        if (!campaignId && createCampaignRes.data && createCampaignRes.data._id) campaignId = createCampaignRes.data._id;
        log(`Campaign created with ID: ${campaignId}`);
    }

    await runTest('List Campaigns', 'GET', '/campaigns');

    // 7. Badges
    const badgeData = {
        name: "Test Badge",
        description: "A test badge",
        imageUrl: "http://example.com/badge.png",
        rarity: "common",
        category: "achievement",
        pointValue: 10
    };
    const createBadgeRes = await runTest('Create Badge', 'POST', '/badges', badgeData);
    if (createBadgeRes && createBadgeRes.success) {
        badgeId = createBadgeRes.data._id || createBadgeRes.data.badge?._id;
        if (!badgeId && createBadgeRes.data && createBadgeRes.data._id) badgeId = createBadgeRes.data._id;
        log(`Badge created with ID: ${badgeId}`);
    }

    await runTest('List Badges', 'GET', '/badges');

    // 8. Stories
    const storyData = {
        title: "Test Story",
        description: "A test story",
        coverImage: "http://example.com/cover.png"
    };
    const createStoryRes = await runTest('Create Story', 'POST', '/stories', storyData);
    if (createStoryRes && createStoryRes.success) {
        storyId = createStoryRes.data._id || createStoryRes.data.story._id;
        if (!storyId && createStoryRes.data && createStoryRes.data._id) storyId = createStoryRes.data._id;
        log(`Story created with ID: ${storyId}`);

        const chapterData = {
            title: "Chapter 1",
            content: "Once upon a time..."
        };
        await runTest('Add Chapter', 'POST', `/stories/${storyId}/chapters`, chapterData);
    }

    // Corrected Route
    await runTest('List My Stories', 'GET', '/stories/my-stories');

    // Cleanup (Optional - delete created resources)
    if (memoryId) {
        await runTest('Delete Memory', 'DELETE', `/memories/${memoryId}`);
    }

    log('Tests Completed.');
};

main();
