/// <reference types="node" />
/**
 * Kunga Basics — Comprehensive Database Seed
 * ─────────────────────────────────────────────
 * Run: npm run db:seed
 *
 * Creates realistic dummy data for all dashboard widgets:
 * - Admin + 30 parent users across 6 countries
 * - 3 module groups, 8 modules, 12 videos
 * - Subscriptions across all platforms (Apple, Google, Stripe, Flutterwave)
 * - Module progress & completions for each user
 * - Ask Dr. Gad submissions (pending + responded)
 * - Donations + scholarship grants
 * - Routine entries + streaks
 * - Activity logs (signup trend data)
 * - Announcements
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedRbac } from './rbac-seed';

const prisma = new PrismaClient();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function weeksAgo(n: number) { return daysAgo(n * 7); }

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── DUMMY USER DATA ─────────────────────────────────────────────────────────

const USERS = [
  { name: 'Sarah Kamau', email: 'sarah.kamau@example.com', country: 'KE', childName: 'Amara', ageMonths: 32, challenges: ['speech_delay', 'sensory_processing'] },
  { name: 'James Omondi', email: 'james.omondi@example.com', country: 'KE', childName: 'Eli', ageMonths: 58, challenges: ['speech_delay', 'attention'] },
  { name: 'Ananya Patel', email: 'ananya.patel@example.com', country: 'AE', childName: 'Rohan', ageMonths: 28, challenges: ['sensory_processing', 'hyperactivity'] },
  { name: 'Maria Torres', email: 'maria.torres@example.com', country: 'US', childName: 'Lucas', ageMonths: 46, challenges: ['speech_delay'] },
  { name: 'David Mwangi', email: 'david.mwangi@example.com', country: 'RW', childName: 'Nia', ageMonths: 36, challenges: ['motor_delay', 'speech_delay'] },
  { name: 'Fatima Al-Rashid', email: 'fatima.rashid@example.com', country: 'AE', childName: 'Yusuf', ageMonths: 72, challenges: ['attention', 'hyperactivity'] },
  { name: 'Grace Mensah', email: 'grace.mensah@example.com', country: 'GH', childName: 'Kwame', ageMonths: 40, challenges: ['speech_delay', 'motor_delay'] },
  { name: 'Chidi Okonkwo', email: 'chidi.okonkwo@example.com', country: 'NG', childName: 'Zara', ageMonths: 24, challenges: ['sensory_processing'] },
  { name: 'Priya Sharma', email: 'priya.sharma@example.com', country: 'GB', childName: 'Arjun', ageMonths: 48, challenges: ['speech_delay', 'attention'] },
  { name: 'Emma Wilson', email: 'emma.wilson@example.com', country: 'GB', childName: 'Oliver', ageMonths: 54, challenges: ['hyperactivity'] },
  { name: 'Hassan Diallo', email: 'hassan.diallo@example.com', country: 'SN', childName: 'Fatou', ageMonths: 30, challenges: ['speech_delay'] },
  { name: 'Amina Bashir', email: 'amina.bashir@example.com', country: 'UG', childName: 'Tariq', ageMonths: 42, challenges: ['motor_delay', 'sensory_processing'] },
  { name: 'Peter Kimani', email: 'peter.kimani@example.com', country: 'KE', childName: 'Biko', ageMonths: 60, challenges: ['attention', 'speech_delay'] },
  { name: 'Sophie Laurent', email: 'sophie.laurent@example.com', country: 'FR', childName: 'Léa', ageMonths: 36, challenges: ['sensory_processing'] },
  { name: 'Marcus Johnson', email: 'marcus.johnson@example.com', country: 'US', childName: 'Jordan', ageMonths: 44, challenges: ['speech_delay', 'hyperactivity'] },
  { name: 'Aisha Mohammed', email: 'aisha.mohammed@example.com', country: 'AE', childName: 'Hamid', ageMonths: 26, challenges: ['speech_delay'] },
  { name: 'Carlos Mendez', email: 'carlos.mendez@example.com', country: 'US', childName: 'Sofia', ageMonths: 38, challenges: ['motor_delay'] },
  { name: 'Thandiwe Dlamini', email: 'thand.dlamini@example.com', country: 'ZA', childName: 'Sive', ageMonths: 30, challenges: ['speech_delay', 'sensory_processing'] },
  { name: 'Ravi Kumar', email: 'ravi.kumar@example.com', country: 'GB', childName: 'Diya', ageMonths: 52, challenges: ['attention'] },
  { name: 'Amara Diop', email: 'amara.diop@example.com', country: 'SN', childName: 'Moussa', ageMonths: 34, challenges: ['speech_delay', 'motor_delay'] },
  { name: 'Claire Dupont', email: 'claire.dupont@example.com', country: 'BE', childName: 'Hugo', ageMonths: 42, challenges: ['sensory_processing', 'attention'] },
  { name: 'Olumide Adeyemi', email: 'olumide.adeyemi@example.com', country: 'NG', childName: 'Teni', ageMonths: 28, challenges: ['speech_delay'] },
  { name: 'Linda Njoroge', email: 'linda.njoroge@example.com', country: 'KE', childName: 'Kai', ageMonths: 36, challenges: ['hyperactivity', 'attention'] },
  { name: 'Tom Bradley', email: 'tom.bradley@example.com', country: 'GB', childName: 'Mia', ageMonths: 48, challenges: ['speech_delay'] },
  { name: 'Naledi Sithole', email: 'naledi.sithole@example.com', country: 'ZA', childName: 'Lebo', ageMonths: 30, challenges: ['motor_delay', 'speech_delay'] },
  { name: 'Ahmed Al-Farsi', email: 'ahmed.alfarsi@example.com', country: 'AE', childName: 'Salim', ageMonths: 56, challenges: ['attention'] },
  { name: 'Patience Asante', email: 'patience.asante@example.com', country: 'GH', childName: 'Kofi', ageMonths: 40, challenges: ['speech_delay', 'sensory_processing'] },
  { name: 'Emily Chen', email: 'emily.chen@example.com', country: 'US', childName: 'Ryan', ageMonths: 44, challenges: ['sensory_processing'] },
  { name: 'Blessing Okafor', email: 'blessing.okafor@example.com', country: 'NG', childName: 'Chika', ageMonths: 32, challenges: ['speech_delay', 'hyperactivity'] },
  { name: 'Nadia Rousseau', email: 'nadia.rousseau@example.com', country: 'CA', childName: 'Émile', ageMonths: 38, challenges: ['attention', 'motor_delay'] },
];

const SUBSCRIPTION_CONFIGS = [
  { plan: 'monthly', platform: 'apple_iap', status: 'ACTIVE' as const },
  { plan: 'annual', platform: 'apple_iap', status: 'ACTIVE' as const },
  { plan: 'monthly', platform: 'google_play', status: 'ACTIVE' as const },
  { plan: 'annual', platform: 'google_play', status: 'ACTIVE' as const },
  { plan: 'monthly', platform: 'stripe', status: 'ACTIVE' as const },
  { plan: 'annual', platform: 'stripe', status: 'ACTIVE' as const },
  { plan: 'monthly', platform: 'flutterwave', status: 'ACTIVE' as const, mobileMoneyProvider: 'mpesa', mobileMoneyPhone: '+254722000001' },
  { plan: 'monthly', platform: 'flutterwave', status: 'ACTIVE' as const, mobileMoneyProvider: 'mtn_momo', mobileMoneyPhone: '+250780000001' },
  { plan: 'monthly', platform: 'flutterwave', status: 'ACTIVE' as const, mobileMoneyProvider: 'airtel_money', mobileMoneyPhone: '+256700000001' },
  { plan: 'monthly', platform: 'stripe', status: 'TRIAL' as const },
  { plan: 'monthly', platform: 'stripe', status: 'CANCELLED' as const },
  { plan: 'monthly', platform: 'apple_iap', status: 'EXPIRED' as const },
];

const DONATION_DATA = [
  { donorName: 'Ananya Patel', amount: 50, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Anonymous', amount: 25, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: false },
  { donorName: 'James Omondi', amount: 10, method: 'FLUTTERWAVE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Maria Torres', amount: 75, method: 'APPLE_PAY' as const, campaign: 'New Module Development', wall: true },
  { donorName: 'David Mwangi', amount: 20, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Ravi Kumar', amount: 100, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Emma Wilson', amount: 30, method: 'GOOGLE_PAY' as const, campaign: 'New Module Development', wall: false },
  { donorName: 'Sophie Laurent', amount: 50, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Tom Bradley', amount: 200, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true },
  { donorName: 'Emily Chen', amount: 40, method: 'APPLE_PAY' as const, campaign: 'New Module Development', wall: true },
];

const ASK_GAD_DATA = [
  { question: 'My daughter is 3.5 and not combining words after finishing S1. Is this concerning?', status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 2 },
  { question: 'Eli has started regressing on eye contact after great progress in C1. What should we do?', status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 3 },
  { question: 'Can I do multiple modules per day? Nia seems to want more sessions.', status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 10 },
  { question: 'What calming exercises work best before bedtime for hyperactivity?', status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 1 },
  { question: 'When should I expect to see improvement in speech after starting Module S2?', status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 14 },
  { question: 'My son refuses to do the sensory exercises. How do I make them fun?', status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 4 },
];

// ─── MAIN SEED ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding Kunga Basics database with rich dummy data...\n');

  // ── 1. ADMIN USER ─────────────────────────────────────────────────────────
  const adminPw = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@kungabasics.com' },
    update: {
      // Keep preferences in sync on every re-seed
      theme: 'system',
      lang: 'en',
      mfaEnabled: false,
    },
    create: {
      email: 'admin@kungabasics.com',
      name: 'Dr. Gad (Admin)',
      passwordHash: adminPw,
      role: 'ADMIN',
      subscriptionStatus: 'ACTIVE',
      // Admin portal preferences — stored directly on the user row
      theme: 'system',     // "system" | "light" | "dark"
      lang: 'en',          // "en" | "fr" | "kin"
      mfaEnabled: false,   // Two-Factor Authentication disabled by default
      preferences: { create: {} },
    },
  });
  console.log(`✅ Admin: admin@kungabasics.com / Admin@1234`);
  console.log(`   🎨 theme=system  🌐 lang=en  🔐 mfaEnabled=false`);

  // ── 2. MODULE GROUPS ──────────────────────────────────────────────────────
  const groupDefs = [
    { name: 'Speech & Language', emoji: '🗣️', description: 'Help your child find their voice and communicate', sortOrder: 1 },
    { name: 'Calm & Focus', emoji: '🧘', description: 'Building emotional regulation and attention skills', sortOrder: 2 },
    { name: 'Movement & Motor', emoji: '🏃', description: 'Developing coordination and body awareness', sortOrder: 3 },
    { name: 'Social & Play Skills', emoji: '🤝', description: 'Building connection through guided play', sortOrder: 4 },
    { name: 'Gut, Sleep & Feeding', emoji: '🌙', description: 'Supporting whole-body development', sortOrder: 5 },
  ];

  const createdGroups: any[] = [];
  for (const g of groupDefs) {
    const group = await prisma.moduleGroup.upsert({ where: { name: g.name }, update: {}, create: g });
    createdGroups.push(group);
    console.log(`   📁 Group: ${group.emoji} ${group.name}`);
  }

  // ── 3. MODULES ────────────────────────────────────────────────────────────
  const moduleDefs = [
    // Speech
    { groupId: createdGroups[0].id, code: 'S1', title: 'Pre-Verbal Communication', description: 'Foundation for early communication', isPreview: true, status: 'PUBLISHED', sortOrder: 1 },
    { groupId: createdGroups[0].id, code: 'S2', title: 'First Words Activation', description: 'Triggering your child\'s first words', isPreview: false, status: 'PUBLISHED', sortOrder: 2 },
    { groupId: createdGroups[0].id, code: 'S3', title: 'Two-Word Combinations', description: 'Building simple sentences', isPreview: false, status: 'PUBLISHED', sortOrder: 3 },
    { groupId: createdGroups[0].id, code: 'S4', title: 'Sentence Building', description: 'Expanding expressive language', isPreview: false, status: 'DRAFT', sortOrder: 4 },
    // Calm
    { groupId: createdGroups[1].id, code: 'C1', title: 'Sensory Grounding', description: 'Desensitisation through guided play', isPreview: true, status: 'PUBLISHED', sortOrder: 1 },
    { groupId: createdGroups[1].id, code: 'C2', title: 'Deep Pressure Techniques', description: 'Calming strategies for overwhelmed children', isPreview: false, status: 'PUBLISHED', sortOrder: 2 },
    { groupId: createdGroups[1].id, code: 'C3', title: 'Attention Span Extension', description: 'Building focus through structured play', isPreview: false, status: 'PUBLISHED', sortOrder: 3 },
    // Movement
    { groupId: createdGroups[2].id, code: 'M1', title: 'Core Strength Basics', description: 'Physical foundation for learning', isPreview: true, status: 'PUBLISHED', sortOrder: 1 },
    { groupId: createdGroups[2].id, code: 'M2', title: 'Fine Motor Skills', description: 'Hand and finger coordination', isPreview: false, status: 'PUBLISHED', sortOrder: 2 },
  ];

  const createdModules: any[] = [];
  for (const m of moduleDefs) {
    const mod = await prisma.module.upsert({ where: { code: m.code }, update: {}, create: m as any });
    createdModules.push(mod);
    console.log(`   📚 Module: [${mod.code}] ${mod.title}`);
  }

  // ── 4. VIDEOS ─────────────────────────────────────────────────────────────
  const videoDefs = [
    { moduleId: createdModules[0].id, title: 'What is Pre-Verbal Communication?', type: 'EXPLANATION', durationSecs: 480, isPreviewClip: true, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[0].id, title: 'Joint Attention Exercises', type: 'PRACTICE', durationSecs: 720, isPreviewClip: false, sortOrder: 2, status: 'PUBLISHED' },
    { moduleId: createdModules[1].id, title: 'Triggering First Words', type: 'EXPLANATION', durationSecs: 540, isPreviewClip: false, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[1].id, title: 'Object Naming Practice', type: 'PRACTICE', durationSecs: 660, isPreviewClip: false, sortOrder: 2, status: 'PUBLISHED' },
    { moduleId: createdModules[2].id, title: 'Combining Two Words', type: 'EXPLANATION', durationSecs: 420, isPreviewClip: false, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[4].id, title: 'Sensory Bin Setup Guide', type: 'DEMONSTRATION', durationSecs: 600, isPreviewClip: true, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[4].id, title: 'Tactile Desensitisation Play', type: 'PRACTICE', durationSecs: 780, isPreviewClip: false, sortOrder: 2, status: 'PUBLISHED' },
    { moduleId: createdModules[5].id, title: 'Deep Pressure Massage Technique', type: 'DEMONSTRATION', durationSecs: 540, isPreviewClip: false, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[5].id, title: 'Bear Hug & Squeeze Exercises', type: 'PRACTICE', durationSecs: 480, isPreviewClip: false, sortOrder: 2, status: 'PUBLISHED' },
    { moduleId: createdModules[6].id, title: 'Building Attention Through Play', type: 'EXPLANATION', durationSecs: 520, isPreviewClip: false, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[7].id, title: 'Floor Play for Core Strength', type: 'DEMONSTRATION', durationSecs: 660, isPreviewClip: true, sortOrder: 1, status: 'PUBLISHED' },
    { moduleId: createdModules[8].id, title: 'Pincer Grip Development', type: 'PRACTICE', durationSecs: 440, isPreviewClip: false, sortOrder: 1, status: 'PUBLISHED' },
  ];

  const createdVideos: any[] = [];
  for (const v of videoDefs) {
    const video = await prisma.video.create({ data: v as any });
    createdVideos.push(video);
    console.log(`   🎥 Video: ${v.title}`);
  }

  console.log(`\n👥 Creating ${USERS.length} parent users with subscriptions & progress...\n`);

  // ── 5. PARENT USERS + SUBSCRIPTIONS + PROGRESS ────────────────────────────
  const createdUsers: any[] = [];
  const pw = await bcrypt.hash('Demo@1234', 10);

  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    const joinedDaysAgo = randInt(5, 180);
    const subConfig = SUBSCRIPTION_CONFIGS[i % SUBSCRIPTION_CONFIGS.length];

    // Create user
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: pw,
        subscriptionStatus: subConfig.status === 'CANCELLED' || subConfig.status === 'EXPIRED' ? subConfig.status : 'ACTIVE',
        pushToken: `ExponentPushToken[${Math.random().toString(36).slice(2)}]`,
        createdAt: daysAgo(joinedDaysAgo),
        lastLoginAt: daysAgo(randInt(0, 7)),
        preferences: { create: {} },
        childProfile: {
          create: {
            childName: u.childName,
            ageMonths: u.ageMonths,
            challenges: u.challenges,
          },
        },
      },
    });
    createdUsers.push(user);

    // Create subscription
    const periodStart = daysAgo(joinedDaysAgo);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (subConfig.plan === 'annual' ? 12 : 1));

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        plan: subConfig.plan,
        status: subConfig.status,
        platform: subConfig.platform,
        mobileMoneyProvider: (subConfig as any).mobileMoneyProvider ?? null,
        mobileMoneyPhone: (subConfig as any).mobileMoneyPhone ?? null,
        periodStart,
        periodEnd,
        cancelledAt: subConfig.status === 'CANCELLED' ? daysAgo(randInt(1, 30)) : null,
      },
    });

    // Create module progress (users complete varying amounts of modules)
    const modulesToComplete = createdModules.slice(0, randInt(1, Math.min(5, createdModules.length)));
    for (const mod of modulesToComplete) {
      const completed = Math.random() > 0.3;
      await prisma.userProgress.upsert({
        where: { userId_moduleId: { userId: user.id, moduleId: mod.id } },
        update: {},
        create: {
          userId: user.id,
          moduleId: mod.id,
          completed,
          watchedPercent: completed ? 100 : randInt(20, 80),
          completedAt: completed ? daysAgo(randInt(0, joinedDaysAgo)) : null,
          lastWatchedAt: daysAgo(randInt(0, 14)),
        },
      });
    }

    // Routine entries (last 7 days)
    for (let day = 0; day < 7; day++) {
      const date = daysAgo(day);
      const dateStr = date.toISOString().split('T')[0];
      const tasks = ['morning_stretch', 'language_play', 'sensory_activity', 'reading_time'];
      for (const taskKey of tasks) {
        const completed = Math.random() > 0.3;
        await prisma.routineEntry.upsert({
          where: { userId_date_category_taskKey: { userId: user.id, date: dateStr, category: 'daily', taskKey } },
          update: {},
          create: {
            userId: user.id,
            date: dateStr,
            category: 'daily',
            taskKey,
            completed,
            completedAt: completed ? date : null,
          },
        });
      }
    }

    // Activity log entries
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'user.registered',
        details: `${u.name} registered via email`,
        createdAt: daysAgo(joinedDaysAgo),
      },
    });

    if (subConfig.status === 'ACTIVE') {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'user.subscribed',
          details: `${u.name} subscribed via ${subConfig.platform} (${subConfig.plan})`,
          createdAt: daysAgo(joinedDaysAgo - 1),
        },
      });

      // Engagement logs spread across D3 / D7 / D14 / D30 windows for realistic
      // cohort retention numbers. Probabilities mirror typical app benchmarks:
      //   D1 ~100%  D7 ~75%  D14 ~55%  D30 ~35%
      const engagementWindows = [
        { offset: 3,  label: 'app.session', prob: 1.00 },  // D1-window — always
        { offset: 7,  label: 'app.session', prob: 0.75 },  // D7-window
        { offset: 14, label: 'app.session', prob: 0.55 },  // D14-window
        { offset: 30, label: 'app.session', prob: 0.35 },  // D30-window
      ];
      for (const w of engagementWindows) {
        if (joinedDaysAgo >= w.offset && Math.random() < w.prob) {
          await prisma.activityLog.create({
            data: {
              userId: user.id,
              action: w.label,
              details: `${u.name} opened app (day ${w.offset} engagement)`,
              createdAt: daysAgo(joinedDaysAgo - w.offset),
            },
          });
        }
      }
    }

    process.stdout.write(`   ✅ ${u.name} (${u.country}) — ${subConfig.platform} ${subConfig.plan}\n`);
  }

  // ── 6. ASK DR. GAD SUBMISSIONS ────────────────────────────────────────────
  console.log('\n🎤 Creating Ask Dr. Gad submissions...');

  // Add avatar URLs to users for display
  const AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=james',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=ananya',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=david',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=fatima',
  ];
  for (let i = 0; i < Math.min(6, createdUsers.length); i++) {
    await prisma.user.update({ where: { id: createdUsers[i].id }, data: { avatarUrl: AVATARS[i] } });
  }

  const RICH_GAD_DATA = [
    { question: "My daughter is 3.5 and not combining words even after finishing S1 and S2. We practice daily but she only says single words. Is this a concern and what should we focus on next?", status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 1, userIdx: 0 },
    { question: "Eli has started regressing on eye contact after making great progress in C1. He used to hold eye contact for 3-4 seconds, now it is back to less than 1 second. What could be causing this regression?", status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 2, userIdx: 1 },
    { question: "What calming exercises work best before bedtime for a hyperactive 3-year-old? We have tried the sensory bin but she gets too excited. Any alternatives?", status: 'SUBMITTED' as const, hasVideo: false, daysAgoN: 3, userIdx: 2 },
    { question: "My son refuses to do any of the sensory desensitisation exercises in C1. He cries as soon as I bring out the materials. How do I make them more approachable?", status: 'SUBMITTED' as const, hasVideo: true, daysAgoN: 4, userIdx: 5 },
    { question: "Can I do multiple modules per day? Nia is very engaged and keeps asking for more. I do not want to overwhelm her but she seems to want it.", status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 10, userIdx: 3, responseText: "Great question, and it is wonderful that Nia is so engaged! I recommend a maximum of 2 module sessions per day, each no longer than 15 minutes. The brain needs time to consolidate learning between sessions. Consistency over intensity is the key principle here. Daily practice beats marathon sessions. Watch for signs of fatigue: losing focus, becoming silly or irritable. When you see these, it is time to stop, even if the session was short. Rest is part of the learning process!" },
    { question: "When should I expect to see improvement in speech after starting Module S2? We are 3 weeks in and I am getting anxious that nothing has changed yet.", status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 14, userIdx: 4, responseText: "Please do not be anxious. 3 weeks is very early! Speech development typically shows measurable change between 6-12 weeks of consistent practice. What you are building right now is the neurological foundation. Think of it like watering seeds: you do not see growth immediately, but it is happening underground. Track small wins: more babbling, more pointing, more reaching for things with intent. These are the early indicators. Stay consistent, and if you are seeing any of these micro-signs, you are on the right path." },
    { question: "Is it normal for my child to seem more frustrated after starting the modules? Lucas has been having more meltdowns since we began C1 two weeks ago.", status: 'UNDER_REVIEW' as const, hasVideo: true, daysAgoN: 5, userIdx: 3 },
    { question: "We have completed M1 and my son core strength has improved significantly. Should we move to M2 or circle back to speech modules since that is still our main concern?", status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 20, userIdx: 1, responseText: "Congratulations on completing M1 — that is fantastic progress! I recommend a parallel approach: continue with M2 for 2 sessions per week to maintain physical development, while spending the majority of your sessions on speech (S2 or S3 if ready). Physical and speech development are deeply interconnected — core strength directly supports breathing control which supports speech production. You do not need to choose one or the other." },
    { question: "My child wears hearing aids. Are the speech modules still appropriate and do I need to modify any exercises?", status: 'SUBMITTED' as const, hasVideo: false, daysAgoN: 0, userIdx: 2 },
    { question: "Can grandparents do the exercises with my child when I am at work? Or does it need to be the same person each time?", status: 'RESPONDED' as const, hasVideo: false, daysAgoN: 18, userIdx: 5, responseText: "Absolutely — grandparents, siblings, and other trusted caregivers can all participate in the exercises! Consistency of the activity matters more than consistency of the person. Having multiple people do the exercises helps generalization — your child learns to apply skills across different people and contexts, which is a crucial developmental step. Brief them on the technique by watching the module videos together, and keep a simple log so everyone knows what was done each day." },
  ];

  for (const q of RICH_GAD_DATA) {
    const user = createdUsers[q.userIdx % createdUsers.length];
    await prisma.askGadSubmission.create({
      data: {
        userId: user.id,
        questionText: q.question,
        videoR2Key: q.hasVideo ? `ask-gad/submissions/video_${q.userIdx}_${Date.now()}.mp4` : null,
        status: q.status,
        responseText: (q as any).responseText ?? null,
        respondedAt: q.status === 'RESPONDED' ? daysAgo(q.daysAgoN - 2) : null,
        createdAt: daysAgo(q.daysAgoN),
        updatedAt: daysAgo(Math.max(0, q.daysAgoN - 1)),
      },
    });
    const icon = q.status === 'SUBMITTED' ? '⏳' : q.status === 'RESPONDED' ? '✅' : '🔍';
    console.log(`   ${icon} "${q.question.slice(0, 65)}…"`);
  }

  // ── 7. DONATIONS ──────────────────────────────────────────────────────────
  console.log('\n💝 Creating donations...');
  // Rich donation data with multiple statuses and methods
  const allDonations = [
    ...DONATION_DATA.map((d, i) => ({ ...d, daysAgoN: (i + 1) * 4, status: 'COMPLETED' as const })),
    // Extra donations for richer data
    { donorName: 'Robert Chen', email: 'robert.chen@example.com', amount: 150, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true, daysAgoN: 2, status: 'COMPLETED' as const },
    { donorName: 'Yetunde Okafor', email: 'yetunde.okafor@example.com', amount: 25, method: 'FLUTTERWAVE' as const, campaign: 'Scholarship Fund', wall: true, daysAgoN: 5, status: 'COMPLETED' as const },
    { donorName: 'Anonymous', email: 'anon1@example.com', amount: 10, method: 'STRIPE' as const, campaign: 'New Module Development', wall: false, daysAgoN: 8, status: 'COMPLETED' as const },
    { donorName: 'Ibrahim Hassan', email: 'ibrahim.hassan@example.com', amount: 75, method: 'GOOGLE_PAY' as const, campaign: 'Scholarship Fund', wall: true, daysAgoN: 11, status: 'COMPLETED' as const },
    { donorName: 'Fatou Diallo', email: 'fatou.diallo@example.com', amount: 20, method: 'APPLE_PAY' as const, campaign: 'Scholarship Fund', wall: true, daysAgoN: 18, status: 'COMPLETED' as const },
    { donorName: 'Marcus Webb', email: 'marcus.webb@example.com', amount: 500, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: true, daysAgoN: 22, status: 'COMPLETED' as const },
    { donorName: 'Pending Donor', email: 'pending2@example.com', amount: 50, method: 'STRIPE' as const, campaign: 'Scholarship Fund', wall: false, daysAgoN: 0, status: 'PENDING' as const },
    { donorName: 'Failed Donor', email: 'failed@example.com', amount: 30, method: 'FLUTTERWAVE' as const, campaign: 'New Module Development', wall: false, daysAgoN: 1, status: 'FAILED' as const },
  ];

  for (let i = 0; i < allDonations.length; i++) {
    const d = allDonations[i];
    const user = i < createdUsers.length ? createdUsers[i % createdUsers.length] : null;
    await prisma.donation.create({
      data: {
        userId: user?.id ?? null,
        email: (d as any).email ?? user?.email ?? 'donor@example.com',
        amountUsd: d.amount,
        currency: 'USD',
        paymentMethod: d.method,
        campaign: d.campaign,
        status: d.status,
        showOnDonorWall: d.wall,
        donorName: d.donorName,
        createdAt: daysAgo((d as any).daysAgoN ?? randInt(1, 60)),
      },
    });
    console.log(`   💝 $${d.amount} from ${d.donorName} via ${d.method} [${d.status}]`);
  }

  // ── 8. SCHOLARSHIP GRANTS ─────────────────────────────────────────────────
  console.log('\n🎓 Creating scholarship grants...');
  const scholarshipRecipients = [
    { user: createdUsers[10], note: 'Single parent in Kenya — recommended by community leader' },
    { user: createdUsers[19], note: 'Family from Senegal — financial hardship verified' },
    { user: createdUsers[26], note: 'Requested by donor Patience Asante directly' },
    { user: createdUsers[14], note: 'Military family with special needs child' },
    { user: createdUsers[22], note: 'Referred by NGO partner in Nairobi' },
  ];
  for (const { user: u, note } of scholarshipRecipients) {
    await prisma.scholarshipGrant.create({
      data: {
        grantedBy: admin.id,
        email: u.email,
        userId: u.id,
        notes: note,
        active: true,
        grantedAt: daysAgo(randInt(5, 90)),
      },
    });
    await prisma.user.update({ where: { id: u.id }, data: { subscriptionStatus: 'SCHOLARSHIP' } });
    await prisma.subscription.upsert({
      where: { userId: u.id },
      update: { status: 'ACTIVE', platform: 'scholarship' },
      create: { userId: u.id, plan: 'scholarship', status: 'ACTIVE', platform: 'scholarship' },
    });
    console.log(`   🎓 Scholarship → ${u.email}`);
  }



  // ── 9. ANNOUNCEMENTS WITH STATS ──────────────────────────────────────────
  console.log('\n📣 Creating announcements with view statistics...');
  const annDefs = [
    { title: 'Welcome to Kunga Basics! 🎉', body: 'Thank you for joining us. Start with Module S1 to begin your child\'s journey.', targetAudience: 'ALL_REGISTERED' as const, daysAgoN: 60, pushSent: 1204, bannerViews: 847 },
    { title: 'New Module C3: Attention Span Extension 🧘', body: 'Module C3 is now live for all subscribers. Build your child\'s focus and attention span through guided activities.', targetAudience: 'ALL_SUBSCRIBERS' as const, daysAgoN: 14, pushSent: 847, bannerViews: 612 },
    { title: 'Scholarship Fund — 3 Families Now Have Free Access 🙏', body: 'Thanks to your generous donations, 3 families who could not afford a subscription now have full access to Kunga Basics.', targetAudience: 'ALL_SUBSCRIBERS' as const, daysAgoN: 7, pushSent: 847, bannerViews: 703 },
    { title: 'App Update v1.0.2 — Faster Videos & Bug Fixes 🚀', body: 'We\'ve improved video loading speed by 40%, fixed the progress tracker, and added dark mode support.', targetAudience: 'ALL_REGISTERED' as const, daysAgoN: 3, pushSent: 1204, bannerViews: 891 },
    { title: 'Weekly Progress Reminder 📊', body: 'Don\'t forget to log your child\'s weekly milestones. Consistent tracking leads to better outcomes!', targetAudience: 'ACTIVE_ONLY' as const, daysAgoN: 1, pushSent: 812, bannerViews: 567 },
    { title: 'Holiday Schedule Notice 🌟', body: 'Dr. Gad will be on leave Dec 24–Jan 2. Responses may be delayed. Happy holidays from the Kunga team!', targetAudience: 'ALL_SUBSCRIBERS' as const, daysAgoN: 0, pushSent: 847, bannerViews: 0, status: 'DRAFT' },
  ];

  const createdAnns: any[] = [];
  for (const a of annDefs) {
    const ann = await prisma.announcement.create({
      data: {
        title: a.title,
        body: a.body,
        targetAudience: a.targetAudience,
        status: (a as any).status ?? 'PUBLISHED',
        publishedAt: (a as any).status === 'DRAFT' ? null : daysAgo(a.daysAgoN),
        pushSentCount: (a as any).status === 'DRAFT' ? 0 : a.pushSent,
        bannerViewCount: (a as any).status === 'DRAFT' ? 0 : a.bannerViews,
        createdAt: daysAgo(a.daysAgoN),
      },
    });
    createdAnns.push(ann);

    // Create dismissal records (simulates users who "saw" the banner)
    if ((a as any).status !== 'DRAFT') {
      const viewerCount = Math.min(Math.floor(a.bannerViews / 30), createdUsers.length);
      for (let v = 0; v < viewerCount; v++) {
        const u = createdUsers[v];
        await prisma.userAnnouncementDismissal.upsert({
          where: { userId_announcementId: { userId: u.id, announcementId: ann.id } },
          update: {},
          create: { userId: u.id, announcementId: ann.id, dismissedAt: daysAgo(Math.max(0, a.daysAgoN - 1)) },
        });
      }
    }
    console.log(`   📣 "${a.title}" — ${(a as any).status ?? 'PUBLISHED'} · ${a.pushSent} sent`);
  }

  // ── 10. EXTRA ACTIVITY LOGS (signup trend data for charts) ────────────────
  console.log('\n📊 Creating activity log entries for signup trend chart...');
  // Create additional signup events spread over 8 weeks
  const signupCounts = [42, 58, 51, 67, 72, 65, 80, 91]; // week 1-8
  let logCount = 0;
  for (let week = 7; week >= 0; week--) {
    const count = signupCounts[7 - week];
    for (let j = 0; j < Math.min(count - 3, 15); j++) { // cap DB writes, backend aggregates from user.createdAt
      await prisma.activityLog.create({
        data: {
          action: 'app.open',
          details: 'App opened by user',
          createdAt: daysAgo(week * 7 + randInt(0, 6)),
        },
      });
      logCount++;
    }
  }
  console.log(`   📊 Created ${logCount} activity log entries`);


  // ── 11. NOTIFICATION TRIGGER DATA ─────────────────────────────────────────
  // Add a pending donation and a failed mobile money sub so the bell shows data
  console.log('\n🔔 Creating notification trigger data...');

  // Pending donation (triggers "pending donations" notification)
  await prisma.donation.create({
    data: {
      email: 'pending.donor@example.com',
      amountUsd: 35,
      currency: 'USD',
      paymentMethod: 'STRIPE',
      campaign: 'Scholarship Fund',
      status: 'PENDING',
      showOnDonorWall: false,
      donorName: 'Pending Donor',
      createdAt: new Date(), // today — triggers "today" notification
    },
  });

  // Failed mobile money subscription (triggers "needs activation" notification)
  const failedUser = createdUsers[5];
  await prisma.subscription.upsert({
    where: { userId: failedUser.id },
    update: {
      platform: 'flutterwave',
      mobileMoneyProvider: 'mpesa',
      mobileMoneyPhone: '+254711000099',
      status: 'NONE',
      updatedAt: new Date(),
    },
    create: {
      userId: failedUser.id,
      plan: 'monthly',
      status: 'NONE',
      platform: 'flutterwave',
      mobileMoneyProvider: 'mpesa',
      mobileMoneyPhone: '+254711000099',
    },
  });
  await prisma.user.update({ where: { id: failedUser.id }, data: { subscriptionStatus: 'NONE' } });

  console.log('   🔔 Pending donation created (triggers donation notification)');
  console.log('   🔔 Failed M-Pesa subscription created (triggers payment notification)');
  console.log('   🔔 Dr. Gad SUBMITTED submissions already created above');
  console.log('   🔔 Recent signups from today already in the DB');


  // ── 12. RICH MOBILE MONEY SUBSCRIPTIONS ──────────────────────────────────
  console.log('\n📱 Creating rich Mobile Money subscription data...');
  const mobileMoneyConfigs = [
    { provider: 'mpesa', phone: '+254722001001', country: 'KE', currency: 'KES', localAmt: 1820, status: 'ACTIVE' },
    { provider: 'mpesa', phone: '+254711002002', country: 'KE', currency: 'KES', localAmt: 1820, status: 'ACTIVE' },
    { provider: 'mpesa', phone: '+254733003003', country: 'KE', currency: 'KES', localAmt: 1820, status: 'ACTIVE' },
    { provider: 'mpesa', phone: '+254700004004', country: 'KE', currency: 'KES', localAmt: 1820, status: 'NONE' },
    { provider: 'mtn_momo', phone: '+250780005005', country: 'RW', currency: 'RWF', localAmt: 19600, status: 'ACTIVE' },
    { provider: 'mtn_momo', phone: '+250789006006', country: 'RW', currency: 'RWF', localAmt: 19600, status: 'ACTIVE' },
    { provider: 'mtn_momo', phone: '+233244007007', country: 'GH', currency: 'GHS', localAmt: 212, status: 'ACTIVE' },
    { provider: 'mtn_momo', phone: '+256700008008', country: 'UG', currency: 'UGX', localAmt: 56000, status: 'CANCELLED' },
    { provider: 'airtel_money', phone: '+256752009009', country: 'UG', currency: 'UGX', localAmt: 56000, status: 'ACTIVE' },
    { provider: 'airtel_money', phone: '+265991010010', country: 'MW', currency: 'MWK', localAmt: 16800, status: 'ACTIVE' },
    { provider: 'airtel_money', phone: '+255754011011', country: 'TZ', currency: 'TZS', localAmt: 35000, status: 'NONE' },
    { provider: 'vodacom_mpesa', phone: '+255765012012', country: 'TZ', currency: 'TZS', localAmt: 35000, status: 'ACTIVE' },
  ];

  // Use users that don't already have active subscriptions from other platforms
  const mmUsersPool = createdUsers.slice(15, 15 + mobileMoneyConfigs.length);
  for (let i = 0; i < mobileMoneyConfigs.length; i++) {
    const cfg = mobileMoneyConfigs[i];
    const user = mmUsersPool[i % mmUsersPool.length];
    if (!user) continue;
    const txRef = 'KB-MM-' + (i + 1).toString().padStart(4, '0') + '-' + Date.now();
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        platform: 'flutterwave',
        mobileMoneyProvider: cfg.provider,
        mobileMoneyPhone: cfg.phone,
        status: cfg.status as any,
        flutterwaveTxId: txRef,
        periodStart: daysAgo(randInt(1, 30)),
        periodEnd: cfg.status === 'ACTIVE' ? daysAgo(-30) : daysAgo(randInt(1, 10)),
      },
      create: {
        userId: user.id,
        plan: 'monthly',
        status: cfg.status as any,
        platform: 'flutterwave',
        mobileMoneyProvider: cfg.provider,
        mobileMoneyPhone: cfg.phone,
        flutterwaveTxId: txRef,
        periodStart: daysAgo(randInt(1, 30)),
        periodEnd: cfg.status === 'ACTIVE' ? daysAgo(-30) : daysAgo(randInt(1, 10)),
      },
    });
    if (cfg.status === 'ACTIVE') {
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: 'ACTIVE' } });
    }
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: cfg.status === 'ACTIVE' ? 'payment.mobilemoney.success' : cfg.status === 'NONE' ? 'payment.mobilemoney.pending' : 'payment.mobilemoney.failed',
        details: `${cfg.provider} payment ${cfg.status} — ${cfg.phone} — ${cfg.currency} ${cfg.localAmt}`,
        createdAt: daysAgo(randInt(0, 20)),
      },
    });
    console.log(`   📱 ${cfg.provider} (${cfg.country}) ${cfg.phone} — ${cfg.status}`);
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count(),
    prisma.module.count(),
    prisma.video.count(),
    prisma.userProgress.count(),
    prisma.donation.count(),
    prisma.askGadSubmission.count(),
    prisma.activityLog.count(),
    prisma.announcement.count(),
  ]);

  // ── 13. RBAC: PERMISSIONS, ROLES, SUPER ADMIN ASSIGNMENT ───────────────────
  await seedRbac(prisma);

  console.log(`
╔══════════════════════════════════════════╗
║       ✨ Seed Complete! Summary          ║
╠══════════════════════════════════════════╣
║  Users (incl. admin)  : ${String(counts[0]).padEnd(17)}║
║  Subscriptions        : ${String(counts[1]).padEnd(17)}║
║  Modules              : ${String(counts[2]).padEnd(17)}║
║  Videos               : ${String(counts[3]).padEnd(17)}║
║  Progress records     : ${String(counts[4]).padEnd(17)}║
║  Donations            : ${String(counts[5]).padEnd(17)}║
║  Ask Dr. Gad          : ${String(counts[6]).padEnd(17)}║
║  Activity logs        : ${String(counts[7]).padEnd(17)}║
║  Announcements        : ${String(counts[8]).padEnd(17)}║
╠══════════════════════════════════════════╣
║  Admin : admin@kungabasics.com           ║
║  Pass  : Admin@1234                      ║
║  Docs  : http://localhost:3001/docs      ║
╚══════════════════════════════════════════╝
`);
}

main()
  .catch(e => { console.error('\n❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
