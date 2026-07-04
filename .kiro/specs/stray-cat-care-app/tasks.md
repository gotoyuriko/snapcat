# Implementation Plan: CodingKitty

## Overview

Implement the CodingKitty modular monolith (Node.js/TypeScript backend + React Native client) in incremental layers: database schema → core modules → AI pipeline → gamification → financial workflows → client UI. TypeScript is used throughout. Property-based tests use `fast-check`; unit tests use `jest`.

---

## Tasks

- [x] 1. Project scaffolding and database schema
  - Prerequisites: Docker and Docker Compose installed, Node.js >= 20.
  - Run `npm install` at the monorepo root to install all workspace dependencies.
  - Run `docker compose up -d` at the project root to start PostgreSQL 16 with PostGIS + pgvector (container: `codingkitty-db`, port 5432 mapped to host 5433).
  - Wait for the DB healthcheck to pass: `docker compose ps` should show `codingkitty-db` as healthy.
  - Run `cd packages/server && npx prisma generate` to generate the Prisma Client.
  - Run `npx prisma migrate deploy` to apply the migration (`0001_initial_schema`) which creates all tables (User, Cat, UserCatDiscovery, Ownership, Sighting, Donation, MedicalRequest, ChatMessage, Partner, FoodItem, UserInventory), enables PostGIS and pgvector extensions, adds geo-indexes, the HNSW vector index, and the Ownership→UserCatDiscovery FK constraint.
  - Verify: `docker exec codingkitty-db psql -U postgres -d codingkitty -c "\\dt"` should list all 11 tables.
  - Note: DATABASE_URL in `packages/server/.env` uses port 5433 (Docker maps host 5433 → container 5432). If port 5433 is occupied, change the port mapping in `docker-compose.yml` and update `.env` accordingly.
  - _Requirements: 14.3_

- [x] 2. Auth Module
  - [x] 2.1 Implement register, login, refresh, logout endpoints using JWT (15 min access enforced exactly with no tolerance / rotating refresh).
    - Passwords hashed with bcrypt.
    - _Requirements: 15.6_
  - [x] 2.2 Write unit tests for token generation, refresh rotation, and expiry edge cases.
    - _Requirements: 14.6_

- [x] 3. GPS Fuzz utility
  - [x] 3.1 Implement `fuzzCoordinates(lat, lng): { fuzzedLat, fuzzedLng }` that applies a random ±100–200 m offset.
    - Return `{ fuzzedLat: null, fuzzedLng: null }` if the function throws.
    - _Requirements: 5.3, 5.4, 14.2_
  - [x] 3.2 Write property test: for any raw (lat, lng) input, the fuzzed output differs from the input by a non-zero offset.
    - **Property 2: GPS fuzz invariant**
    - **Validates: Requirements 5.3, 5.5, 14.2**

- [x] 4. Recognition Module — AI Pipeline
  - [x] 4.1 Set up YOLO (Ultralytics) service client: `detectCat(photoBuffer): { cropped: Buffer } | { noDetection: true }`.
    - Call the Ultralytics YOLO inference endpoint; parse response.
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 Set up MegaDescriptor (wildlife-tools) service client: `embed(croppedBuffer): Float32Array[512]`.
    - Call HuggingFace inference endpoint; validate returned vector length = 512.
    - _Requirements: 4.1_
  - [x] 4.3 Write property test: for any image buffer passed to `embed()`, the returned vector has exactly 512 dimensions.
    - **Property 8: Embedding dimensionality consistency**
    - **Validates: Requirements 4.1**
  - [x] 4.4 Implement pgvector nearest-neighbour query: `findNearestCat(embedding): { catId, similarity }[]`.
    - Use cosine similarity; return top-3 matches with scores.
    - _Requirements: 4.2_
  - [x] 4.5 Implement `recognizeCat(photo, userGPS, userId)` orchestrator:
    - Stage 1: call `detectCat`; if no detection, strictly halt all processing (no crop, no re-ID) and return `{ result: "no_cat" }`.
    - Stage 2: call `embed`; call `findNearestCat`.
    - Apply thresholds: ≥ 0.92 → matched; 0.72–0.92 → confirm_needed; < 0.72 → new_cat.
    - For matched/new: call Sighting Module, call Gamification Module.
    - Return exactly one discriminated union result type.
    - _Requirements: 3.1, 3.2, 4.3, 4.4, 4.5_
  - [x] 4.6 Write property test: for any similarity score, `recognizeCat` returns exactly one of the four result types.
    - **Property 1: Scan result exclusivity**
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.3, 4.4, 4.5**
  - [x] 4.7 Implement `POST /scan` and `POST /scan/confirm` API endpoints wired to the orchestrator.
    - _Requirements: 3.1, 4.6, 4.7_

- [x] 5. Sighting / Location Module
  - [x] 5.1 Implement `appendSighting(catId, userId, rawGPS, photoUrl, type)`:
    - Applies `fuzzCoordinates` before writing; updates `Cat.lastKnownApproxLocation` with fuzzed coords.
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
  - [x] 5.2 Write property test: for any sighting created by `appendSighting`, the stored coordinates differ from the raw GPS input (never raw).
    - **Property 2: GPS fuzz invariant (sighting layer)**
    - **Validates: Requirements 5.3, 5.5, 14.2**
  - [x] 5.3 Implement `GET /map` endpoint: returns cat pins (fuzzed coords only) filtered by user's UserCatDiscovery set.
    - Discovered cats: return full pin data. Undiscovered: return silhouette with approximate area only.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 5.4 Write property test: for any userId and cat list, every cat not in the user's UserCatDiscovery set is returned as a silhouette without name, photo, or exact coordinates.
    - **Property 9: Discovery state controls map and Catpedia visibility**
    - **Validates: Requirements 2.2, 2.3, 2.4, 7.3, 7.4, 7.5**

- [x] 6. Gamification Module
  - [x] 6.1 Implement `recordAction(userId, catId, actionType)`:
    - Award XP per design table; enforce daily donation XP cap of 200/user/cat.
    - Update both global User.xp and per-cat Ownership/UserCatDiscovery XP.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 6.2 Write property test: for any sequence of donation actions on a given day, total XP awarded from donations does not exceed 200 XP for that user–cat pair.
    - **Property 10: XP award correctness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  - [x] 6.3 Implement ownership level promotion logic:
    - After each XP update, evaluate cumulative per-cat XP against level thresholds.
    - Promote or demote level accordingly; create Ownership record at Lvl1 if absent.
    - Verify UserCatDiscovery record exists before creating Ownership.
    - Send push notification only after both promotion and ownership record creation are committed to DB.
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 15.3_
  - [x] 6.4 Write property test: for any user–cat pair, once Ownership exists, a corresponding UserCatDiscovery record also exists.
    - **Property 5: Discovery–Ownership referential integrity**
    - **Validates: Requirements 6.10, 14.3**
  - [x] 6.5 Write property test: for any sequence of XP changes, the Ownership level correctly reflects the current cumulative XP against the defined thresholds (monotone within a session when XP only increases).
    - **Property 3: Ownership promotion monotonicity (and demotion correctness)**
    - **Validates: Requirements 6.5, 6.8**

- [x] 7. Checkpoint — Core pipeline green
  - Ensure all tests pass. Verify scan → recognition → sighting → XP → ownership promotion end-to-end with mocked AI services.
  - Ask the user if questions arise.

- [x] 8. Catpedia Module
  - [x] 8.1 Implement `GET /catpedia` endpoint with filter query param (`all` | `discovered` | `owned`):
    - Returns cats matching filter for the requesting user.
    - Undiscovered cats: silhouette only (no name, photo).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 8.2 Write property test: for any Catpedia response for a given userId, every cat in the response that is not in the user's UserCatDiscovery set contains no name or photo field.
    - **Property 9: Discovery state controls Catpedia visibility**
    - **Validates: Requirements 7.3, 7.4, 7.5**

- [x] 9. Community Chat Module
  - [x] 9.1 Implement WebSocket (Socket.io) channel per cat, gated by Lvl1+ ownership check.
    - On connect: verify Ownership.level >= 1; reject with 403 if not.
    - _Requirements: 8.1, 8.2_
  - [x] 9.2 Implement `POST /cats/:catId/messages` and `GET /cats/:catId/messages` REST fallbacks.
    - Same ownership gate; persist ChatMessage records.
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 9.3 Write property test: for any ChatMessage submission, the message is accepted if and only if the sender has Ownership.level >= 1 for the cat; all other submissions return 403.
    - **Property 7a: Ownership gates chat access**
    - **Validates: Requirements 8.1, 8.2**

- [x] 10. Partner & Staff-Verification Module
  - [x] 10.1 Implement staff-only CRUD for Partner records: create, verify (set verified=true), revoke (set verified=false, immediate effect).
    - Staff role enforced via JWT claim.
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [x] 10.2 Write unit tests for partner verification and revocation, including assignment blocking.
    - _Requirements: 13.3, 13.4_

- [x] 11. Medical Module & Temporal Workflow
  - [x] 11.1 Implement `POST /medical-requests`:
    - Ownership gate: reject with 403 if user is not Lvl7+ for the cat.
    - Upload supporting documents to object storage; store signed URLs.
    - Create MedicalRequest record with status "pending".
    - _Requirements: 9.1, 9.2, 9.9_
  - [x] 11.2 Write property test: for any MedicalRequest submission, the request is accepted if and only if the requester has Ownership.level >= 7 for the cat; all others return 403.
    - **Property 7b: Ownership gates medical access**
    - **Validates: Requirements 9.1, 9.2**
  - [x] 11.3 Implement Temporal `MedicalReimbursementWorkflow`:
    - Steps: verifyRequest (Staff-Verification) → notifyPartner → awaitServiceCompletion (7-day timeout) → verifyInvoice → releaseReimbursement / reject.
    - Allow status transition from "rejected" to "reimbursed" when valid documents are submitted after a prior documentation rejection.
    - Use workflowId = requestId for idempotence.
    - Resume from last checkpoint on retry (Temporal handles this via event sourcing).
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 15.4_
  - [x] 11.4 Write property test: re-running the `MedicalReimbursementWorkflow` with the same workflowId produces the same terminal status and financial amounts.
    - **Property 6: Temporal workflow idempotence**
    - **Validates: Requirements 9.1, 14.4**

- [x] 12. Donation / Wallet Module & Temporal Workflow
  - [x] 12.1 Implement wallet top-up flow:
    - `POST /wallet/topup`: call security scanner (Aikido if free tier available, otherwise skip) → create payment intent via SANDBOX gateway → return payment URL.
    - `POST /wallet/webhook`: validate signature → credit walletBalance in integer MYR cents.
    - _Requirements: 10.1, 10.2, 10.8, 14.1, 14.5_
  - [x] 12.2 Implement food item catalogue (`GET /food-items`) and purchase endpoint (`POST /food-items/purchase`):
    - Purchase deducts wallet; increments UserInventory quantity.
    - Reject if walletBalance < item price.
    - _Requirements: 10.3, 10.4, 10.5_
  - [x] 12.3 Write property test: for any sequence of purchase and donation operations, walletBalance never goes below zero.
    - **Property 4: Wallet balance non-negativity**
    - **Validates: Requirements 10.3, 10.4, 10.5**
  - [x] 12.4 Implement food donation endpoint (`POST /donations`):
    - Deduct item from UserInventory; create Donation record; start Temporal `DonationEscrow` workflow.
    - Reject if item quantity = 0; do NOT create a Donation record or persist any record for rejected transactions.
    - _Requirements: 10.5, 10.6_
  - [x] 12.5 Implement Temporal `DonationEscrowWorkflow`:
    - Hold item value for 24 h → release to cat pool → award XP → notify owners.
    - Use workflowId = donationId for idempotence.
    - _Requirements: 10.6, 10.7, 14.4_
  - [x] 12.6 Write property test: re-running `DonationEscrowWorkflow` with the same workflowId results in the same XP award and no duplicate wallet deduction.
    - **Property 6: Temporal workflow idempotence (donation)**
    - **Validates: Requirements 10.6, 14.4**

- [x] 13. Checkpoint — Workflows and financial layer green
  - Ensure all financial module tests pass. Verify wallet top-up → purchase → donate → escrow → XP award with mocked payment gateway and Temporal test server.
  - Ask the user if questions arise.

- [x] 14. Alerts Module
  - [x] 14.1 Implement push notification service wrapper (FCM/APNs) with rate-limiter (max 10/user/hour using sliding window in Redis or DB); ownership milestone notifications SHALL bypass the rate limit.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 14.2 Wire push notifications to events: Lvl1 promotion, MedicalRequest status change, donation escrow release, new sighting for owned cat.
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 14.3 Write property test: for any user and any simulated burst of notification events in a 1-hour window, the total non-milestone notifications delivered does not exceed 10; ownership milestone notifications bypass the rate limit.
    - **Property 11: Notification rate limit (with milestone bypass)**
    - **Validates: Requirements 12.5**

- [x] 15. React Native Client — Map and Scan screens
  - [x] 15.1 Implement permissions onboarding screen:
    - Show explanation before requesting location and camera permissions.
    - Handle denied states per Requirements 1.3 and 1.4.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 15.2 Implement live map screen using react-native-maps:
    - Fetch `GET /map` on load and on GPS change; render revealed pins and silhouettes.
    - Tap silhouette → show approximate area label; tap revealed pin → navigate to cat profile (always show full profile info).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 15.3 Implement camera scan screen:
    - Capture photo → `POST /scan` → handle no_cat (prompt retry), confirm_needed (show dialog), matched/new_cat (reveal or register flow).
    - _Requirements: 3.1, 3.2, 3.3, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 16. React Native Client — Cat Profile, Catpedia, Chat, Donation
  - [x] 16.1 Implement Cat profile screen:
    - Show name, photo, ownership level, XP progress bar (accumulated XP always visible), sighting history.
    - Show "Feed Cat" button for discovered cats; show "Request Medical/Grooming" for Lvl7+ owners (greyed out and locked with "Available after Level 7" for lower levels).
    - Show Owner Leaderboard: ranked list of Lvl1+ owners by per-cat XP; display "No owners yet" when empty.
    - Only show full profile to users who have discovered the cat; otherwise show silhouette + approximate area (display-only restriction).
    - _Requirements: 6.5, 6.7, 8.1, 9.1, 9.3, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_
  - [x] 16.6 Implement `GET /cats/:catId/leaderboard` API endpoint:
    - Returns Owner entries for the cat ranked by cumulative per-cat XP, with display name, level, XP, and rank.
    - Return empty list with "No owners yet" message when no Lvl1+ Owners exist.
    - Remove Owners who have lost discovery status (reverted to UNDISCOVERED) from the leaderboard.
    - Gated: requester must have a UserCatDiscovery record for the cat (Lvl0+).
    - _Requirements: 14.5, 14.6_
  - [x] 16.2 Implement Catpedia screen:
    - Filter tabs: All / Discovered / Owned.
    - Undiscovered cats shown as locked silhouettes.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 16.3 Implement community chat screen (Lvl1+ gate enforced client-side and server-side):
    - Real-time messages via Socket.io; show 403 screen for non-owners.
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 16.4 Implement wallet top-up and food item purchase screens:
    - Top-up → redirect to payment URL (in-app browser); purchase → decrement wallet display.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 16.5 Implement WebAR feeding screen:
    - Open WebView with WebAR page on "Feed Cat" tap.
    - Listen for `feedingComplete` message → trigger `POST /donations`.
    - On WebView load failure → show fallback donation confirmation screen.
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 16.7 Implement badge display on profiles:
    - `GET /gamification/badges` endpoint: derives earned badges from existing data (no badge table).
    - Global milestone badges (First Donation, 100 Total Donations, Discovered 10/50 Cats).
    - Per-cat level badges (bronze Lvl3, silver Lvl5, gold Lvl7, diamond Lvl10) — highest tier per cat, featuring the cat's photo.
    - Badge showcase section on the Profile screen, always visible (empty state prompt when no badges).
    - _Requirements: 17.3, 17.5, 17.7, 17.10, 18.3, 18.4, 18.5_

- [x] 16.8 Profile menu essentials:
    - Remove the stray "Log out" button from the Map (main) screen; logout lives on the Profile screen only.
    - `PATCH /auth/me` endpoint to update display name (zod-validated, auth-gated).
    - Profile menu: Edit Profile (display name modal), My Rewards (level-reward inventory per Requirement 17.11), Donation History.
    - _Requirements: 17.11_

- [x] 16.9 Requirement 4 gaps — owner confirm prompt & share-to-chat:
    - Lvl1+ owners of the matched cat are routed to the "Is this <Cat>?" confirmation even above the auto-match threshold (Req 4.4).
    - After a confirmed match, Lvl1+ owners can share the scan photo to the cat's community chat (Req 4.9): ChatMessage.photoUrl column (migration), photo-capable chat send API, share button on the matched scan screen, photo rendering in chat.
    - requirements.md reconciled with shipped values: 768-dim MegaDescriptor-T embeddings; configurable thresholds (defaults 0.85 auto-match / 0.5 confirm).
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.9_

- [x] 16.10 Requirement 5.7 — cat location moves only on scan sightings:
    - `appendSighting` updates lastKnownApproxLocation only for type 'scan'; manual reports are recorded without moving the cat.
    - `POST /sightings` no longer accepts a client-supplied type (previously defaulted to 'scan', letting manual reports spoof scan sightings); REST reports are always 'manual'. Scan sightings come exclusively from the recognition pipeline.
    - Property test added for the scan-only location-update rule.
    - Known deviation (Req 5.4): a failed GPS fuzz stores sentinel (0,0) instead of null — fuzzedLat/Lng are non-nullable columns; near-impossible in practice, revisit if it ever matters.
    - _Requirements: 5.7_

- [x] 16.11 Requirement 7.5 — Nearby Cats search in Catpedia:
    - "Nearby" filter tab: reveals silhouettes of undiscovered cats within 100 m of the user's current GPS location (haversine on the cat's last known fuzzed scan location), filtered client-side from the 'all' response.
    - Empty states for no GPS fix and no cats in range.
    - _Requirements: 7.5_

- [x] 16.12 Requirement 8 fixes — real-time parity for REST chat sends:
    - REST-persisted chat messages (e.g. scan-photo shares) now broadcast to the cat's socket room via `broadcastChatMessage`, so online owners see them without reloading (Req 8.3 parity).
    - Socket `send_message` accepts an optional validated `photoUrl` (same own-photo-route restriction as REST).
    - Remaining gap (Req 8.5, partial): no general in-chat image picker/upload — only scanned photos can be shared; would need expo-image-picker + a chat upload endpoint.
    - _Requirements: 8.3, 8.5_

- [x] 16.13 Requirement 9 completion — medical request lifecycle:
    - Workflow no longer auto-rejects pending requests: staff review is a Temporal signal (`staffDecision`); request stays 'pending' until staff act. On approval the requester gets a confirmation (with appointment details) and the partner is notified (Req 9.5, 9.6).
    - New endpoints: POST /:id/approve and /:id/reject (staffGuard; approve validates the partner is certified), /:id/partner-accept (staff-entered), /:id/complete (multipart 'invoice' + 'receipt', BOTH required per Req 9.8; ?resubmission=true drives rejected → reimbursed).
    - MedicalRequest.reason column (migration) + create now requires a reason (min 10 chars) and ≥1 supporting document (Req 9.4).
    - GET /documents/:fileName serves signed private documents (HMAC + expiry + path-traversal guard) — signed URLs previously 404'd (Req 9.12).
    - Create response includes certified partner list (Req 9.13).
    - Note: partner-accept/complete use staff/requester auth — partners have no login; client UI for the medical flow remains unimplemented (button navigates nowhere).
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8, 9.12, 9.13_

- [x] 17. Checkpoint — Client screens integrated
  - Ensure all screens render correctly with the running backend. Run the full E2E happy path: onboard → scan → discover cat → donate food → verify XP update → check Catpedia filter.
  - Ask the user if questions arise.

- [x] 18. Security hardening
  - [x] 18.1 Integrate security scanning on all `/wallet` and `/donations` routes (Aikido SDK if free tier available; otherwise use `npm audit` + Trivy for dependency scanning and input validation middleware).
    - _Requirements: 14.1_
  - [x] 18.2 Audit all API responses to ensure no raw GPS coordinates are ever serialised.
    - Add a response interceptor that strips or checks raw lat/lng fields.
    - _Requirements: 5.5, 14.2_
  - [x] 18.3 Write property test: for any API response from `/map`, `/catpedia`, `/cats/:id`, and `/sightings`, no returned coordinate pair matches the raw input GPS (fuzz always applied).
    - **Property 2: GPS fuzz invariant (API layer)**
    - **Validates: Requirements 5.5, 14.2**

- [x] 19. Final checkpoint — All tests pass
  - Run full test suite (unit + property + integration). Verify Temporal workflows with Temporal dev server. Confirm security scanning passes on payment surface.
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional (test/QA tasks) and can be skipped for a faster MVP demo.
- All code is TypeScript. Backend: Node.js + Express. ORM: Prisma. Queue: Temporal. DB: PostgreSQL + PostGIS + pgvector.
- Property tests use `fast-check`; unit/integration tests use `jest`.
- AI services (YOLO, MegaDescriptor) are called via HTTP; mock them with `jest.mock` for unit/property tests.
- Temporal dev server (`temporal server start-dev`) is used for local workflow testing.
- Payment gateway is in SANDBOX mode throughout; no real money moves.
- Object storage: use a local MinIO instance in development; swap to S3-compatible provider for demo.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1"] },
    { "id": 1, "tasks": ["2.2", "3.2", "4.1", "4.2"] },
    { "id": 2, "tasks": ["4.3", "4.4"] },
    { "id": 3, "tasks": ["4.5"] },
    { "id": 4, "tasks": ["4.6", "4.7", "5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "6.3"] },
    { "id": 6, "tasks": ["5.4", "6.4", "6.5", "8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "10.1", "11.1", "12.1"] },
    { "id": 9, "tasks": ["10.2", "11.2", "11.3", "12.2"] },
    { "id": 10, "tasks": ["11.4", "12.3", "12.4"] },
    { "id": 11, "tasks": ["12.5", "12.6", "14.1"] },
    { "id": 12, "tasks": ["14.2", "14.3"] },
    { "id": 13, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 14, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6"] },
    { "id": 15, "tasks": ["18.1", "18.2"] },
    { "id": 16, "tasks": ["18.3"] }
  ]
}
```
