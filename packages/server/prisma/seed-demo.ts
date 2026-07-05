/**
 * Demo showcase seed for a single account.
 *
 * 1. Clears ALL cat-related data recorded by the target user (their cats,
 *    discoveries, ownerships, sightings, donations, XP logs, chat messages,
 *    medical requests + stage trails).
 * 2. Generates a full feature showcase:
 *    - cats owned at various levels (Lvl1 → Lvl8, incl. Lvl7+ care unlock)
 *    - a discovered-but-not-owned cat
 *    - nearby cats not yet discovered (map-only)
 *    - released donations feeding the community pool
 *    - grooming/medical requests frozen at EVERY lifecycle stage with full
 *      stage timelines (pending, awaiting_owner, pending_review, in_progress,
 *      rejected, timed_out, reimbursed)
 *
 * Usage: npx ts-node prisma/seed-demo.ts [email]
 * Default email: christjandra15@gmail.com
 *
 * NOTE: showcase requests are display-only — no live Temporal workflow backs
 * them, so stage-action buttons on them will not advance the workflow.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_EMAIL = process.argv[2] ?? 'christjandra15@gmail.com';

// Subang-area cluster (median of the existing real cats).
const CENTER = { lat: 3.113, lng: 101.591 };

const daysAgo = (d: number, hours = 0) =>
  new Date(Date.now() - d * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000);

async function clearUserCatData(userId: string) {
  // Cats recorded by this user, plus previous showcase cats recorded by the
  // demo helper account (the "nearby" cats), so re-runs don't duplicate pins.
  const friendIds = (
    await prisma.user.findMany({
      where: { email: 'demo-friend@codingkitty.app' },
      select: { id: true },
    })
  ).map((u) => u.id);
  const cats = await prisma.cat.findMany({
    where: { firstDiscovererId: { in: [userId, ...friendIds] } },
    select: { id: true },
  });
  const catIds = cats.map((c) => c.id);

  // Requests on those cats or by this user (events cascade with the request).
  await prisma.medicalRequest.deleteMany({
    where: { OR: [{ requesterId: userId }, { catId: { in: catIds } }] },
  });
  await prisma.chatMessage.deleteMany({
    where: { OR: [{ senderId: { equals: userId } }, { catId: { in: catIds } }] },
  });
  await prisma.donationXpLog.deleteMany({
    where: { OR: [{ userId }, { catId: { in: catIds } }] },
  });
  await prisma.scanXpLog.deleteMany({
    where: { OR: [{ userId }, { catId: { in: catIds } }] },
  });
  await prisma.donation.deleteMany({
    where: { OR: [{ donorId: userId }, { catId: { in: catIds } }] },
  });
  await prisma.sighting.deleteMany({
    where: { OR: [{ reporterId: userId }, { catId: { in: catIds } }] },
  });
  // Post-merge tables that reference Cat/User (level rewards + coupons).
  await prisma.levelRewardGrant.deleteMany({
    where: { OR: [{ userId }, { catId: { in: catIds } }] },
  });
  await prisma.coupon.deleteMany({
    where: { OR: [{ userId }, { grantedForCatId: { in: catIds } }] },
  });
  await prisma.ownership.deleteMany({
    where: { OR: [{ userId: { equals: userId } }, { catId: { in: catIds } }] },
  });
  await prisma.userCatDiscovery.deleteMany({
    where: { OR: [{ userId }, { catId: { in: catIds } }] },
  });
  // CatEmbedding cascades on cat delete.
  await prisma.cat.deleteMany({ where: { id: { in: catIds } } });

  console.log(`Cleared ${catIds.length} recorded cat(s) and all related data for ${TARGET_EMAIL}.`);
}

interface CatSpec {
  name: string;
  photo: string;
  dLat: number;
  dLng: number;
  /** 'owned' creates discovery+ownership; 'discovered' only discovery; 'nearby' neither */
  relation: 'owned' | 'discovered' | 'nearby';
  level?: number;
  xp?: number;
  discoveredDaysAgo?: number;
}

const CATS: CatSpec[] = [
  // Lvl10 max-level owner (diamond badge) — carries the reimbursed grooming showcase
  // NOTE: only these placecats URLs are verified to return 200 (named routes
  // like /neko or /gideon 404). Different sizes serve different cats, so the
  // size-based URLs below are distinct images too.
  { name: 'Oyen', photo: 'https://placecats.com/poppy/400/400', dLat: 0.0012, dLng: -0.0008, relation: 'owned', level: 10, xp: 236, discoveredDaysAgo: 60 },
  // Lvl7 — care just unlocked; carries in-flight request stages
  { name: 'Snowy', photo: 'https://placecats.com/millie/400/400', dLat: -0.0015, dLng: 0.001, relation: 'owned', level: 7, xp: 112, discoveredDaysAgo: 45 },
  // Mid levels
  { name: 'Milo', photo: 'https://placecats.com/louie/400/400', dLat: 0.002, dLng: 0.0018, relation: 'owned', level: 5, xp: 58, discoveredDaysAgo: 30 },
  { name: 'Luna', photo: 'https://placecats.com/401/401', dLat: -0.0022, dLng: -0.0014, relation: 'owned', level: 3, xp: 19, discoveredDaysAgo: 14 },
  { name: 'Bella', photo: 'https://placecats.com/bella/400/400', dLat: 0.0008, dLng: 0.0025, relation: 'owned', level: 1, xp: 2, discoveredDaysAgo: 3 },
  // Discovered but never fed/owned (Lvl0)
  { name: 'Toby', photo: 'https://placecats.com/402/402', dLat: -0.0009, dLng: 0.0006, relation: 'discovered', discoveredDaysAgo: 1 },
  // Nearby, not yet discovered by the user — visible on the map only
  { name: 'Ghost', photo: 'https://placecats.com/403/403', dLat: 0.003, dLng: -0.002, relation: 'nearby' },
  { name: 'Mimi', photo: 'https://placecats.com/398/398', dLat: -0.003, dLng: 0.0028, relation: 'nearby' },
];

async function main() {
  const user = await prisma.user.findFirst({ where: { email: TARGET_EMAIL } });
  if (!user) {
    throw new Error(`User ${TARGET_EMAIL} not found — register the account first.`);
  }

  await clearUserCatData(user.id);

  // A helper account acts as first discoverer of the not-yet-discovered cats.
  let friend = await prisma.user.findFirst({ where: { email: 'demo-friend@codingkitty.app' } });
  if (!friend) {
    friend = await prisma.user.create({
      data: {
        email: 'demo-friend@codingkitty.app',
        passwordHash: 'demo-not-loginable',
        displayName: 'Demo Friend',
      },
    });
  }

  // Certified partners must exist (main seed creates them).
  const salon = await prisma.partner.findFirst({ where: { type: 'salon', verified: true } });
  const vet = await prisma.partner.findFirst({ where: { type: 'vet', verified: true } });
  if (!salon || !vet) {
    throw new Error('No certified partners found — run `npm run prisma:seed` first.');
  }

  // --- Cats + discoveries + ownerships + sightings ---
  const catIdByName: Record<string, string> = {};
  for (const spec of CATS) {
    const lat = CENTER.lat + spec.dLat;
    const lng = CENTER.lng + spec.dLng;
    const discoverer = spec.relation === 'nearby' ? friend.id : user.id;
    const discoveredAt = daysAgo(spec.discoveredDaysAgo ?? 7);

    const cat = await prisma.cat.create({
      data: {
        name: spec.name,
        firstDiscovererId: discoverer,
        lastKnownApproxLat: lat,
        lastKnownApproxLng: lng,
        photoUrl: spec.photo,
        registeredAt: discoveredAt,
      },
    });
    catIdByName[spec.name] = cat.id;

    // Sighting so the cat shows on the map with a photo.
    await prisma.sighting.create({
      data: {
        catId: cat.id,
        reporterId: discoverer,
        fuzzedLat: lat,
        fuzzedLng: lng,
        photoUrl: spec.photo,
        type: 'scan',
        timestamp: discoveredAt,
      },
    });

    if (spec.relation === 'nearby') {
      await prisma.userCatDiscovery.create({
        data: { userId: friend.id, catId: cat.id, discoveredAt },
      });
      continue;
    }

    await prisma.userCatDiscovery.create({
      data: { userId: user.id, catId: cat.id, discoveredAt },
    });
    if (spec.relation === 'owned') {
      await prisma.ownership.create({
        data: {
          userId: user.id,
          catId: cat.id,
          level: spec.level ?? 1,
          xp: spec.xp ?? 1,
          since: discoveredAt,
        },
      });
    }
  }

  // --- Donations: released → they fund the community pool ---
  const foodItems = await prisma.foodItem.findMany();
  const kibble = foodItems.find((f) => f.name === 'Cat Kibble');
  const tuna = foodItems.find((f) => f.name === 'Tuna Can');
  const donations = [
    { cat: 'Oyen', amountCents: 10000, item: tuna, d: 20 },
    { cat: 'Oyen', amountCents: 5000, item: tuna, d: 12 },
    { cat: 'Snowy', amountCents: 8000, item: tuna, d: 10 },
    { cat: 'Milo', amountCents: 1000, item: kibble, d: 5 },
    { cat: 'Luna', amountCents: 1000, item: kibble, d: 2 },
  ];
  for (const don of donations) {
    await prisma.donation.create({
      data: {
        donorId: user.id,
        catId: catIdByName[don.cat],
        foodItemId: don.item?.id,
        foodItem: don.item?.name ?? '',
        amountCents: don.amountCents,
        source: 'direct',
        status: 'released',
        createdAt: daysAgo(don.d),
      },
    });
  }

  // --- Community members (other caretakers from around the area) ---
  const MEMBERS = [
    { email: 'aisha.demo@codingkitty.app', name: 'Aisha (Kelana Jaya)' },
    { email: 'daniel.demo@codingkitty.app', name: 'Daniel (Ara Damansara)' },
    { email: 'meiling.demo@codingkitty.app', name: 'Mei Ling (Taman Mayang)' },
    { email: 'farid.demo@codingkitty.app', name: 'Farid (SS7)' },
    { email: 'priya.demo@codingkitty.app', name: 'Priya (Dataran Prima)' },
  ];
  const members: { id: string; name: string }[] = [];
  for (const m of MEMBERS) {
    let memberUser = await prisma.user.findFirst({ where: { email: m.email } });
    if (!memberUser) {
      memberUser = await prisma.user.create({
        data: { email: m.email, passwordHash: 'demo-not-loginable', displayName: m.name },
      });
    }
    members.push({ id: memberUser.id, name: m.name });
  }

  /**
   * Give a member Lvl1+ ownership on a cat (chat requires Lvl1) and post a
   * message. Levels vary so the cat's owner leaderboard looks lived-in.
   */
  const memberLevel: Record<string, number> = {};
  async function communityMessage(
    catName: string,
    memberIdx: number,
    content: string,
    dAgo: number,
    photoUrl?: string,
  ) {
    const catId = catIdByName[catName];
    const member = members[memberIdx % members.length];
    const key = `${member.id}:${catId}`;
    if (!(key in memberLevel)) {
      const level = 1 + ((memberIdx + catName.length) % 4); // Lvl 1–4
      memberLevel[key] = level;
      const xpByLevel = [0, 2, 8, 20, 35];
      await prisma.userCatDiscovery.create({
        data: { userId: member.id, catId, discoveredAt: daysAgo(40) },
      });
      await prisma.ownership.create({
        data: { userId: member.id, catId, level, xp: xpByLevel[level], since: daysAgo(40) },
      });
    }
    await prisma.chatMessage.create({
      data: { catId, senderId: member.id, content, createdAt: daysAgo(dAgo), photoUrl },
    });
  }
  const ownerId = user.id;
  async function ownerMessage(catName: string, content: string, dAgo: number, photoUrl?: string) {
    await prisma.chatMessage.create({
      data: {
        catId: catIdByName[catName],
        senderId: ownerId,
        content,
        createdAt: daysAgo(dAgo),
        photoUrl,
      },
    });
  }

  // --- Community chat: updates on every recorded cat ---
  await communityMessage('Oyen', 0, 'Spotted Oyen near the mamak this morning, he looks healthy and chonky as always 😸', 9);
  await ownerMessage('Oyen', 'Fed Oyen this morning — he was waiting at the usual spot! 🐱', 8);
  await communityMessage('Oyen', 1, 'He came by my shop around noon, gave him some water. Very vocal today!', 7);
  await ownerMessage('Oyen', 'Took him to his grooming appointment, he looks so fluffy now ✨', 5, 'https://placecats.com/poppy/400/400');
  await communityMessage('Oyen', 2, 'Whoever paid for the grooming — thank you! He looks like a new cat 🥹', 4);

  await communityMessage('Snowy', 1, 'Snowy update: she has been sheltering under the walkway near the LRT during the rains', 6);
  await ownerMessage('Snowy', 'Submitted a grooming request for her, the matting is getting bad with this weather', 2);
  await communityMessage('Snowy', 4, 'I can help bring her to the salon if the request gets approved, I live nearby!', 1, undefined);

  await communityMessage('Milo', 3, 'Milo caught a lizard today and was VERY proud of himself 🦎😂', 5, 'https://placecats.com/louie/400/400');
  await communityMessage('Milo', 0, 'Left some kibble at the usual corner for him this evening', 3);
  await ownerMessage('Milo', 'He is getting friendlier — let me pet him for the first time today!', 1);

  await communityMessage('Luna', 2, 'Luna has been hanging around the playground, kids love her but please remind them to be gentle', 4);
  await communityMessage('Luna', 4, 'Gave her a tuna can, she finished the whole thing 😋', 2, 'https://placecats.com/401/401');

  await communityMessage('Bella', 1, 'Welcome to the community, Bella! First spotted her near the condo lobby', 3);
  await ownerMessage('Bella', 'Just registered her — she is very shy but food-motivated 😄', 2);

  await communityMessage('Toby', 3, 'Anyone know if Toby has a caretaker yet? He seems young, maybe 6 months', 1);

  console.log(`Seeded community chat: ${members.length} members with messages on 6 cats.`);

  // --- Care requests: one frozen at every lifecycle stage ---
  interface RequestSpec {
    cat: string;
    type: 'medical' | 'grooming';
    status: string;
    reason: string;
    partnerId?: string;
    rejectionReason?: string;
    amountCents?: number;
    reimbursed?: boolean;
    startedDaysAgo: number;
    /** [status, note, daysAgo] trail; 'pending' entry auto-added first */
    trail: Array<[string, string, number]>;
  }

  const requests: RequestSpec[] = [
    {
      cat: 'Oyen', type: 'grooming', status: 'reimbursed',
      reason: 'Fur badly matted around the hindquarters, needs professional dematting and a full groom.',
      partnerId: salon.id, amountCents: 8000, reimbursed: true, startedDaysAgo: 18,
      trail: [
        ['awaiting_owner', 'Approved by staff — waiting for the owner to choose a certified location', 17],
        ['pending_review', 'Owner chose Whisker Wash Grooming Studio — staff arranging cooperation', 16],
        ['in_progress', 'Salon agreed to cooperate — service must be completed within 30 days', 15],
        ['in_progress', 'Owner submitted receipt (RM 80.00) and 2 photo(s) — waiting for the partner\'s proof', 10],
        ['in_progress', 'Partner proof (invoice) received from the salon', 9],
        ['reimbursed', 'Documentation verified on both sides — reimbursement released from the community pool', 9],
      ],
    },
    {
      cat: 'Oyen', type: 'medical', status: 'in_progress',
      reason: 'Limping on the front left paw since yesterday, possible sprain or thorn.',
      partnerId: vet.id, startedDaysAgo: 6,
      trail: [
        ['awaiting_owner', 'Approved by staff — waiting for the owner to choose a certified location', 5],
        ['pending_review', 'Owner chose a vet clinic — staff arranging cooperation', 4],
        ['in_progress', 'Clinic agreed to cooperate — service must be completed within 30 days', 3],
      ],
    },
    {
      cat: 'Snowy', type: 'grooming', status: 'awaiting_owner',
      reason: 'Long-haired coat is tangling badly in the rainy season, needs a trim and wash.',
      startedDaysAgo: 2,
      trail: [
        ['awaiting_owner', 'Approved by staff — waiting for the owner to choose a certified location', 1],
      ],
    },
    {
      cat: 'Snowy', type: 'medical', status: 'pending_review',
      reason: 'Recurring eye discharge, needs a check-up and possibly antibiotic drops.',
      partnerId: vet.id, startedDaysAgo: 4,
      trail: [
        ['awaiting_owner', 'Approved by staff — waiting for the owner to choose a certified location', 3],
        ['pending_review', 'Owner chose a clinic — staff are arranging cooperation with the clinic', 2],
      ],
    },
    {
      cat: 'Snowy', type: 'grooming', status: 'pending',
      reason: 'Nails overgrown and curling, needs a professional nail trim session.',
      startedDaysAgo: 0,
      trail: [],
    },
    {
      cat: 'Oyen', type: 'grooming', status: 'rejected',
      reason: 'Wants a fancy lion cut for aesthetics.',
      rejectionReason: 'Cosmetic-only grooming is not covered by the community pool',
      startedDaysAgo: 25,
      trail: [
        ['rejected', 'Rejected by staff review: Cosmetic-only grooming is not covered by the community pool', 24],
      ],
    },
    {
      cat: 'Oyen', type: 'medical', status: 'timed_out',
      reason: 'Annual vaccination booster due.',
      partnerId: vet.id, startedDaysAgo: 50,
      trail: [
        ['awaiting_owner', 'Approved by staff — waiting for the owner to choose a certified location', 49],
        ['pending_review', 'Owner chose a clinic — staff arranging cooperation', 48],
        ['in_progress', 'Clinic agreed to cooperate — service must be completed within 30 days', 47],
        ['timed_out', 'Service was not completed within the 30-day window', 17],
      ],
    },
  ];

  for (const spec of requests) {
    const created = daysAgo(spec.startedDaysAgo, 2);
    const request = await prisma.medicalRequest.create({
      data: {
        catId: catIdByName[spec.cat],
        requesterId: user.id,
        type: spec.type,
        reason: spec.reason,
        status: spec.status,
        partnerId: spec.partnerId,
        rejectionReason: spec.rejectionReason,
        amountCents: spec.amountCents ?? 0,
        reimbursedAt: spec.reimbursed ? daysAgo(spec.trail[spec.trail.length - 1][2]) : null,
        receiptUrl: spec.reimbursed ? 'https://placecats.com/200/280' : null,
        invoiceUrl: spec.reimbursed ? 'https://placecats.com/210/280' : null,
        createdAt: created,
        workflowId: '', // display-only showcase — no live Temporal workflow
      },
    });
    await prisma.medicalRequestEvent.create({
      data: {
        requestId: request.id,
        status: 'pending',
        note: 'Request submitted — received and under staff review',
        createdAt: created,
      },
    });
    for (const [status, note, d] of spec.trail) {
      await prisma.medicalRequestEvent.create({
        data: { requestId: request.id, status, note, createdAt: daysAgo(d) },
      });
    }
  }

  console.log(`Created ${CATS.length} showcase cats, ${donations.length} donations, ${requests.length} care requests for ${TARGET_EMAIL}.`);
  console.log('Owned: Oyen L10 (diamond), Snowy L7 (gold), Milo L5 (silver), Luna L3 (bronze), Bella L1 · Discovered: Toby · Nearby: Ghost, Mimi');
  console.log('Requests: reimbursed, in_progress, awaiting_owner, pending_review, pending, rejected, timed_out');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
