# SnapCat — Project Overview

*A capture-based community sharing platform for cat lovers to assist the strays nearby.*
*From the community, by the community, for the community.*

---

## 1. Introduction

SnapCat is a mobile social platform that turns everyday encounters with stray cats into organized, collective care. Snap a photo of a cat on the street, and SnapCat's AI recognizes whether it is a known community cat or a brand-new discovery. From that single capture grows everything else: a shared map of the neighborhood's cats, a community of co-owners per cat, a per-cat chat room, a donation pool, and a verified pipeline for funding real veterinary and grooming care.

The idea was born from where we live. Our team is from Malaysia, where stray cats are famously friendly — because Malaysians love them back. Walk one to five meters down almost any street and you will meet an adult cat sunbathing, a whole family of four or five kittens, and sometimes a cat that looks hurt, ungroomed, dirty, or skinny from hunger. The love is everywhere; what's missing is a way to organize it.

SnapCat's answer is **virtual adoption**: you cannot always take a cat home, but you can always take responsibility for one — together.

## 2. Problem Statement

**People who care about strays usually cannot adopt them.** Allergies, homes already full of pets, rental restrictions, parents who say no. Caring individuals are everywhere, but their care stays informal, invisible, and uncoordinated.

This creates four concrete problems:

1. **No continuity of care.** A stray that a person feeds every morning simply disappears one day — moved on, injured, or taken. Nobody else knew that person was watching it, so nobody else picks up the watch. When you're occupied with work and can't check on a stray you care about, its wellbeing becomes a blind spot.
2. **No shared knowledge.** Ten neighbors may each "know" the same cat under ten different names, none aware the others feed it too. Duplicate feeding, missed injuries, and no single picture of the cat's health or whereabouts.
3. **No trustworthy funding channel.** People will happily contribute a few ringgit for a stray's vaccination — but only if they can trust the money actually reaches that specific cat's treatment. Informal collections have no verification, no transparency, and no accountability.
4. **No recognition for caretakers.** The aunties and students who feed strays daily do society's animal-welfare work for free, invisibly. There is no structure that recognizes, encourages, or grows this behavior.

## 3. Significance of the App

SnapCat is significant because it converts *diffuse individual kindness* into *structured community infrastructure* — without asking anyone to change what they already do. You were already snapping photos of street cats; now that photo registers a sighting. You were already feeding a stray; now that feeding is visible to everyone else who cares about the same cat.

Three design decisions carry that significance:

- **Identity for the invisible.** AI re-identification (YOLOX detection + MegaDescriptor embeddings) gives every stray a persistent identity — a profile, a name, a history, a community — built purely from photos. A stray stops being "some orange cat near the mamak" and becomes *Oyen, discovered 4th July, 12 owners, last seen this morning*.
- **Shared, levelled ownership.** Every cat can have many owners, each with their own bond level (0–10) earned through real care actions. Ownership is earned, not claimed — and it decays if you disappear (inactivity revocation), keeping each cat's community honest and current.
- **Verified money flow.** Donations are escrowed and released into a per-cat community pool. Medical spending is only reimbursed after a **three-party verification** — the owner's receipt and in-clinic photos, the certified partner clinic's own proof, and staff review. Every ringgit is traceable from donor to treatment.

## 4. System Functionality — What SnapCat Can Do

### 📸 Capture & AI Recognition
- Scan any cat with the in-app camera. A YOLOX model confirms a cat is present; a MegaDescriptor embedding is matched against every known cat's photo gallery (pgvector similarity search) with confidence thresholds — confident match, "is this the same cat?" confirmation, or brand-new registration.
- **First discoverers** name the cat (multi-language moderation on names) and instantly become its founding owner at Level 3.
- Every scan logs a sighting and updates the cat's map position, earning re-sighting XP once per day per cat.

### 🗺️ Live Community Map & Catpedia
- Cats you have discovered appear as full pins — photo, name, tap for a preview card and profile. Cats discovered only by others appear as **silhouettes with an approximate area**: enough to go hunting, never enough to spoil the discovery (or endanger the cat — exact GPS coordinates never leave the server; all locations are fuzzed).
- The Catpedia catalogs every cat as All / Stray / Pet / Nearby (within 100 m of you).

### 🏅 Virtual Adoption: XP, Levels, Badges & Rewards
- Per-cat ownership levels 0–10, earned via feeding (XP = RM donated, daily-capped), daily sightings, and funded care.
- Milestone tiers award medal badges — bronze (L3), silver (L5), gold (L7), diamond (L10) — rendered as decorated frames around *that cat's own photo*, plus global badges (discoveries, donations) with a full badge catalogue and progress tracking.
- Level-ups grant tangible rewards: free food items, single-use discount coupons applied at checkout, and an engraved keychain order at top level. A Level Rewards page shows the whole ladder — tiers passed, current progress, and what's coming.
- Owner leaderboards per cat and a global XP leaderboard recognize the most devoted caretakers.
- Ownership requires upkeep: 30 days of inactivity revokes it (with a warning), and a fresh scan restores it.

### 💬 Community Chat per Cat
- Every cat has its own real-time chat room (Socket.io), gated to Level 1+ owners. Shared owners post sightings, feeding updates, health observations, and photos — so when you're too busy to check on a stray, someone else's update keeps you connected. Non-owners see a teaser of recent messages as an invitation to join in.

### 🍣 Donations, Food Tokens & the Community Pool
- Users purchase donation tokens shaped as cat food — kibble (RM1), snacks (RM5), tuna cans (RM10) — through a direct checkout, into a personal inventory.
- Feeding a cat consumes inventory and triggers a **durable Temporal escrow workflow**: funds are held, then released into that specific cat's community pool. The pool balance is computed from the ledger itself, so it can never drift or be double-spent.

### 🏥 Medical & Grooming Care with Verified Reimbursement
- Owners at Level 7+ can request professional care, with a reason and supporting photo documentation. Requests then move through a fully tracked lifecycle, each stage recorded in a visible timeline and notified in-app:
  1. **Pending** — staff review the request.
  2. **Awaiting owner** — approved; the owner chooses from certified partner locations near the cats (vet clinics for medical, salons for grooming).
  3. **Pending review** — staff arrange cooperation with the chosen clinic.
  4. **In progress** — the clinic agreed; the visit is arranged through personal contact and must be completed within 30 days.
  5. **Verification** — the owner pays out of pocket and submits the receipt, amount, and in-clinic photos; the clinic submits its own proof; invalid documentation can be corrected and resubmitted.
  6. **Reimbursed** — after both sides check out, the amount is released from the cat's community pool and the requester earns +100 XP.
- The entire lifecycle runs on a Temporal workflow — durable timers, idempotent payouts, and no lost state even across server restarts.

### 🔒 Trust & Safety Throughout
- JWT authentication with rotating refresh tokens; staff-only operations behind a dedicated guard.
- Location privacy by construction: server-side GPS fuzzing plus a response-level filter.
- Medical documents in private storage behind expiring signed URLs; payment webhooks HMAC-verified; cat names moderated.
- 405 automated tests, including property-based tests of the invariants that protect users' money and data.

## 5. Contribution Towards Society and Cat Lovers

**For the cats:** more eyes, more meals, and a real path to treatment. A stray with twelve part-time guardians and a funded community pool is dramatically safer than one with a single anonymous feeder. Injuries get noticed in chat, funded from the pool, and treated at certified clinics — with the whole journey documented.

**For cat lovers:** SnapCat removes the false choice between adopting and doing nothing. The student whose landlord forbids pets, the office worker with allergies, the parent whose kids are begging for a cat — all of them can now genuinely *own* a stray: feed it, follow it, fund its care, and be recognized for it. The gamified bond (levels, badges, leaderboards) isn't decoration; it's the feedback loop that turns one-off kindness into a habit.

**For communities:** shared cats become shared projects. Neighbors who have never spoken coordinate feeding schedules in a cat's chat room. The pool of small donations — RM1 kibble at a time — aggregates into vaccinations and grooming that no single person would have paid for alone. And because every contribution and payout is verified and visible, the system builds the one thing informal animal welfare always lacked: **trust**.

**For animal welfare at large:** SnapCat generates something valuable beyond the app — a living, photo-verified census of a neighborhood's stray population, with locations, health notes, and care history. That data, held with privacy safeguards, is exactly what shelters, TNR (trap-neuter-return) programs, and municipal animal services never have.

---

*SnapCat — because you don't have to take a cat home to give it one.* 🐾
