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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
