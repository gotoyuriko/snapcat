# SnapCat — full demo database setup (partner guide)

## One-time setup (after `git pull` on the dev branch)

From the repo root (the inner `codingkitty` folder):

```bash
npm install
docker compose up -d

cd packages\server
npx prisma migrate dev        # applies all 17 migrations to the fresh DB
npm run prisma:seed           # base data: food items + 6 certified partners near the cats
```

Register an account in the app first (run the stack: `npm run dev` at root, `npm run worker` in `packages\server`, `npm run tunnel` in `packages\client`, scan the QR with Expo Go).

## Generate the full showcase for an account

```bash
cd packages\server
npx ts-node prisma/seed-demo.ts their-email@example.com
```

That one command wipes any previous showcase data for the account and generates everything we agreed on:

- 8 cats with photos around the Subang cluster: owned at Levels 10/7/5/3/1 (all four badge tiers: diamond, gold, silver, bronze), one discovered-only (Toby), two undiscovered nearby silhouettes (Ghost, Mimi)
- 7 care requests covering every lifecycle stage (reimbursed with full timeline, in-progress, awaiting-owner with the salon picker, pending-review, pending, rejected with reason, timed-out)
- Donation history funding the community pool
- Community chat — 5 neighborhood members (Aisha, Daniel, Mei Ling, Farid, Priya) with 17 dated messages across 6 cats: sightings, feeding updates, shared photos, care-request chatter

## Notes

- Safe to re-run anytime — it clears and rebuilds each time.
- Certified partners must exist first (that's why `npm run prisma:seed` comes before it — it errors clearly if skipped).
- The seeded care requests are display-only; create a fresh request in-app to demo the live Temporal flow.
- If `prisma migrate dev` hits an EPERM on the query-engine DLL, stop the API/worker first, then retry.
