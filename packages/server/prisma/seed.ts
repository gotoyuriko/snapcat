/**
 * Seeds the food item catalogue (Requirement 10.1): cat kibble, cat snack, tuna can.
 * Prices match the XP table in design.md (kibble RM1, snack RM5, tuna can RM10 = XP earned on donation).
 * Safe to re-run — upserts by name instead of inserting duplicates.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOOD_ITEMS = [
  { name: 'Cat Kibble', priceCents: 100, description: 'A bag of dry cat kibble.' },
  { name: 'Cat Snack', priceCents: 500, description: 'A pack of cat treats.' },
  { name: 'Tuna Can', priceCents: 1000, description: 'A can of tuna for cats.' },
];

/**
 * Mock certified partners (Requirement 9.13): vet clinics and grooming salons
 * placed near where the cats in the database actually are. Offsets are in
 * degrees (~0.001° ≈ 110 m), so partners land within walking/short-drive
 * distance of the cat cluster. Falls back to central KL if no cats exist yet.
 */
const PARTNER_TEMPLATES = [
  { name: 'PurrfectCare Veterinary Clinic', type: 'vet', contactEmail: 'hello@purrfectcare.example.my', dLat: 0.004, dLng: 0.003 },
  { name: 'Kucing Sihat Animal Hospital', type: 'vet', contactEmail: 'appointments@kucingsihat.example.my', dLat: -0.006, dLng: 0.005 },
  { name: 'Meow Medic 24hr Vet', type: 'vet', contactEmail: 'care@meowmedic.example.my', dLat: 0.009, dLng: -0.007 },
  { name: 'Whisker Wash Grooming Studio', type: 'salon', contactEmail: 'book@whiskerwash.example.my', dLat: -0.003, dLng: -0.004 },
  { name: 'Fluff & Buff Cat Spa', type: 'salon', contactEmail: 'spa@fluffbuff.example.my', dLat: 0.006, dLng: 0.008 },
  { name: 'Comel Cuts Pet Salon', type: 'salon', contactEmail: 'meow@comelcuts.example.my', dLat: -0.008, dLng: -0.002 },
];

// Central KL fallback when the database has no located cats yet.
const FALLBACK_CENTER = { lat: 3.139, lng: 101.6869 };

async function seedPartners() {
  const located = await prisma.cat.findMany({
    where: { NOT: { AND: [{ lastKnownApproxLat: 0 }, { lastKnownApproxLng: 0 }] } },
    select: { lastKnownApproxLat: true, lastKnownApproxLng: true },
  });

  // Median rather than mean: test cats with junk coordinates (e.g. fuzzed
  // around 0,0) would otherwise drag the centre into the ocean.
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const center =
    located.length > 0
      ? {
          lat: median(located.map((c) => c.lastKnownApproxLat)),
          lng: median(located.map((c) => c.lastKnownApproxLng)),
        }
      : FALLBACK_CENTER;

  for (const [i, tpl] of PARTNER_TEMPLATES.entries()) {
    const lat = center.lat + tpl.dLat;
    const lng = center.lng + tpl.dLng;
    const data = {
      name: tpl.name,
      type: tpl.type,
      contactEmail: tpl.contactEmail,
      verified: true,
      address: `${12 + i * 7}, Jalan Kucing ${i + 1}, ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
    };
    const existing = await prisma.partner.findFirst({ where: { name: tpl.name } });
    if (existing) {
      await prisma.partner.update({ where: { id: existing.id }, data });
    } else {
      await prisma.partner.create({ data });
    }
  }
  console.log(
    `Seeded ${PARTNER_TEMPLATES.length} certified partners near ` +
      `(${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})` +
      (located.length > 0 ? ` — centroid of ${located.length} cats.` : ' — KL fallback (no located cats).'),
  );
}

async function main() {
  for (const item of FOOD_ITEMS) {
    const existing = await prisma.foodItem.findFirst({ where: { name: item.name } });
    if (existing) {
      await prisma.foodItem.update({ where: { id: existing.id }, data: item });
    } else {
      await prisma.foodItem.create({ data: item });
    }
  }
  console.log(`Seeded ${FOOD_ITEMS.length} food items.`);

  await seedPartners();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
