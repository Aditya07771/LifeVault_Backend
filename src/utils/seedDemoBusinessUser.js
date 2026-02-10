import User from '../models/User.js';

/**
 * Ensures a demo "business" account exists for local/dev use.
 * This is safe to run multiple times (idempotent).
 */
export async function seedDemoBusinessUser() {
  const email = process.env.DEMO_BUSINESS_EMAIL || 'business@lifevault.demo';
  const password = process.env.DEMO_BUSINESS_PASSWORD || 'Business@123';

  const existing = await User.findOne({ email });
  if (existing) return { created: false, email, password };

  const user = new User({
    email,
    password,
    name: 'Demo Business',
    userType: 'brand',
    organizationInfo: {
      name: 'Demo Brand',
      description: 'Demo business account for creating quests',
      isVerified: true,
      verifiedAt: new Date(),
      category: 'demo'
    }
  });

  await user.save();
  console.log(`🏢 Seeded demo business user: ${email} / ${password}`);
  return { created: true, email, password };
}

