# Requirements Document

## Introduction

CodingKitty is a community-driven stray cat care app for Malaysia. Users discover stray cats via an AI-powered camera scan (YOLO detection + MegaDescriptor re-ID), build a contribution ladder through sightings and donations, and unlock care features (community chat, medical/grooming requests) as they deepen their involvement with individual cats. The backend is a modular monolith; durable workflows (Temporal) govern multi-step financial operations.

---

## Glossary

- **System**: The CodingKitty modular monolith backend plus React Native client, acting together.
- **User**: An authenticated CodingKitty app user.
- **Cat**: A registered stray cat profile in the system.
- **Sighting**: A geo-tagged observation of a cat, recorded after a successful scan or manual report.
- **Recognition_Pipeline**: The two-stage AI pipeline: YOLO detection followed by MegaDescriptor re-identification.
- **UserCatDiscovery**: The per-user record that marks a cat as "discovered" for that user (Lvl0 state).
- **Ownership**: The per-user, per-cat contribution record that, once XP threshold is reached, marks the user as an Owner (Lvl1+).
- **Catpedia**: The in-app catalogue of all cats, filterable by discovery/ownership state.
- **Wallet**: The user's in-app balance denominated in MYR cents, funded via the payment gateway sandbox.
- **MedicalRequest**: A request by an Owner for veterinary or grooming care for a cat.
- **Temporal_Worker**: The Temporal workflow engine that executes durable, multi-step workflows.
- **Partner**: A verified veterinary clinic or pet salon registered in the system.
- **XP**: Experience points accumulated by a User per cat or globally.
- **Lvl0**: Discovered state — a UserCatDiscovery record exists but Ownership XP is below threshold.
- **Lvl1+**: Owner state — Ownership XP for that cat has reached or exceeded 500 XP.
- **GPS_Fuzz**: A ±100–200 m random offset applied to raw GPS coordinates before storage or transmission to clients.
- **Aikido**: Third-party security scanning service wrapping payment/donation API surfaces (optional — used only if free tier is available; otherwise replaced by `npm audit` + Trivy).
- **YOLO**: Ultralytics YOLO model used for cat detection and crop.
- **MegaDescriptor**: Pre-trained wildlife re-identification model (HuggingFace) producing a 512-dim embedding.
- **pgvector**: PostgreSQL extension for storing and querying cat embedding vectors.
- **WebAR**: Browser-based augmented reality experience loaded inside a React Native WebView.

---

## Requirements

### Requirement 1: Onboarding Permissions

**User Story:** As a first-time user, I want to be asked for location and camera permissions with a clear explanation, so that I understand why the app needs access before granting it.

#### Acceptance Criteria

1. WHEN a first-time User opens the app, THE System SHALL display a permissions explanation screen before requesting OS-level location permission.
2. WHEN a first-time User opens the app, THE System SHALL display a permissions explanation screen before requesting OS-level camera permission.
3. IF a User denies location permission, THEN THE System SHALL display a message explaining that map functionality is limited and SHALL not load the live map.
4. IF a User denies camera permission, THEN THE System SHALL display a message explaining that scanning is unavailable and SHALL disable the scan button.

---

### Requirement 2: Live Map Display

**User Story:** As a user, I want to see stray cats on a live map, so that I can find and discover cats near me.

#### Acceptance Criteria

1. WHEN a User opens the map view, THE System SHALL display Cat pins at their last-known approximate location, using GPS_Fuzz coordinates.
2. WHEN a Cat has been discovered by the current User, THE System SHALL render that Cat's pin as a revealed icon.
3. WHEN a Cat has NOT been discovered by the current User, THE System SHALL render that Cat's pin as a silhouette icon.
4. WHEN a User taps a silhouette pin, THE System SHALL display only the Cat's approximate area and SHALL NOT reveal the Cat's name, photo, or profile.
5. WHEN a User taps a revealed Cat pin, THE System SHALL navigate to that Cat's full profile page.
6. THE System SHALL update Cat pin positions on the map within 60 seconds of a new Sighting being recorded.

---

### Requirement 3: Cat Scanning — Detection Stage

**User Story:** As a user, I want to scan a cat with my camera, so that the system can identify it.

#### Acceptance Criteria

1. WHEN a User submits a photo via the scan interface, THE System SHALL pass the photo to YOLO for cat detection before any re-identification step.
2. WHEN YOLO detects no cat in the submitted photo, THE System SHALL return an error response and SHALL prompt the User to retake the photo.
3. WHEN YOLO detects a cat in the submitted photo, THE System SHALL crop the detected region and proceed to the re-identification stage.
4. THE System SHALL complete the YOLO detection step within 5 seconds of photo submission under normal network conditions.

---

### Requirement 4: Cat Re-Identification — MegaDescriptor Stage

**User Story:** As a user, I want the system to recognize whether the cat I scanned is already known, so that I get credit for discovering or re-sighting an existing cat.

#### Acceptance Criteria

1. WHEN a cropped cat image passes YOLO detection, THE System SHALL pass it to MegaDescriptor to generate a 512-dimensional embedding.
2. WHEN an embedding is generated, THE System SHALL query pgvector for the nearest existing Cat embedding using cosine similarity.
3. WHEN the nearest-neighbour similarity score is ≥ 0.92, THE System SHALL treat the result as a high-confidence match to the existing Cat.
4. WHEN the nearest-neighbour similarity score is ≥ 0.72 and < 0.92, THE System SHALL present the candidate Cat to the User with a confirmation prompt ("Is this <Cat>?") and SHALL await the User's response before proceeding.
5. WHEN the nearest-neighbour similarity score is < 0.72 OR no embeddings exist in the database, THE System SHALL register a new Cat record with the embedding and the current User as firstDiscoverer.
6. WHEN a User confirms a borderline match, THE System SHALL treat the interaction as a high-confidence match for all subsequent steps.
7. WHEN a User rejects a borderline match, THE System SHALL register a new Cat as in criterion 5.

---

### Requirement 5: Sighting Recording & Location Update

**User Story:** As a user, I want my scan to be recorded as a sighting and update the cat's known location, so that the community has fresh location data.

#### Acceptance Criteria

1. WHEN a scan results in a confirmed match (high-confidence or user-confirmed), THE System SHALL create a Sighting record with the fuzzed GPS coordinates of the scanning User.
2. WHEN a scan results in a new Cat registration, THE System SHALL create a Sighting record for the new Cat.
3. WHEN a Sighting record is created, THE System SHALL apply GPS_Fuzz to the raw GPS coordinates before persisting or transmitting them.
4. IF GPS_Fuzz processing fails for a Sighting, THEN THE System SHALL store the Sighting with a null location value rather than storing raw coordinates.
5. WHEN a Sighting is recorded for an existing Cat, THE System SHALL update that Cat's lastKnownApproxLocation using only fuzzed coordinates from the new Sighting.
6. THE System SHALL store raw GPS coordinates only in the server-side database and SHALL never transmit raw coordinates to any client.

---

### Requirement 6: Gamification — XP & Ownership Progression

**User Story:** As a user, I want to earn XP for caring for cats, so that I can become an owner and unlock additional features.

#### Acceptance Criteria

1. WHEN a User's scan results in discovering a cat for the first time (new Cat registration), THE System SHALL award 100 XP to that User's global total and to their per-cat XP for that Cat.
2. WHEN a User's scan results in re-sighting an existing Cat, THE System SHALL award 50 XP to that User's per-cat XP for that Cat (once per unique daily scan per cat).
3. WHEN a User donates a food item to a Cat, THE System SHALL award XP equal to the MYR price of the donated item (e.g., 1 RM item = 1 XP, 5 RM item = 5 XP, 10 RM item = 10 XP) to that User's per-cat XP for that Cat, up to a maximum of 200 XP per User per Cat per day from donations.
4. WHEN a MedicalRequest reaches "reimbursed" status, THE System SHALL award 100 XP to the requesting User's per-cat XP for that Cat.
5. WHEN a User's cumulative per-cat XP for a specific Cat reaches or exceeds the threshold for the next ownership level, THE System SHALL promote that User's Ownership level for that Cat by one.
6. THE System SHALL use the following cumulative XP thresholds for ownership levels: Lvl0 = Discovered (0 XP), Lvl1 = Owner (1 XP cumulative), Lvl2 (6 XP cumulative), Lvl3 (16 XP cumulative), with each subsequent level requiring additional XP in increasing increments, up to a maximum of Lvl10.
7. THE System SHALL track the total cumulative per-cat XP earned by a User across all levels; levelling up SHALL NOT reset the XP counter to zero.
8. WHEN XP for a User–Cat pair falls below the threshold for the current level, THE System SHALL demote that User's Ownership level to the appropriate level for the current XP total.
9. WHEN a User is promoted to Lvl1 for a Cat, THE System SHALL create an Ownership record if one does not exist and SHALL send the User a push notification.
10. THE System SHALL maintain a UserCatDiscovery record independently from the Ownership record; promoting to Lvl1 SHALL NOT delete the UserCatDiscovery record, and a UserCatDiscovery record MAY exist without a corresponding Ownership record.

---

### Requirement 7: Catpedia

**User Story:** As a user, I want to browse all registered cats in a catalogue, so that I can see which cats I've discovered or own.

#### Acceptance Criteria

1. THE System SHALL provide a Catpedia view listing all registered Cats.
2. WHEN a User views the Catpedia, THE System SHALL support three filter modes: "All", "Discovered" (Lvl0), and "Owned" (Lvl1+).
3. WHEN a Cat in Catpedia has NOT been discovered by the current User, THE System SHALL render that Cat as a locked silhouette and SHALL NOT display its name or photo.
4. WHEN a Cat in Catpedia has been discovered by the current User, THE System SHALL display that Cat's name and photo.
5. WHEN a User taps an undiscovered Cat entry in Catpedia, THE System SHALL display only the Cat's approximate area and SHALL NOT reveal identifying details.

---

### Requirement 8: Community Chat

**User Story:** As an owner-level user, I want to chat with other owners of a cat, so that we can coordinate care.

#### Acceptance Criteria

1. WHEN a User is Lvl1+ Owner of a Cat, THE System SHALL display the community chat interface and allow that User to read messages and send new messages for that Cat.
2. WHEN a User who is NOT a Lvl1+ Owner of a Cat attempts to access, read, or send a message in that Cat's chat, THE System SHALL reject the request with a 403 authorization error and SHALL NOT display the chat interface.
3. WHEN an Owner sends a message, THE System SHALL persist the ChatMessage and broadcast it to all other online Owners of that Cat in real time.
4. WHEN a User is promoted to Lvl1 for a Cat, THE System SHALL automatically unlock the chat interface for that Cat without requiring a page refresh.

---

### Requirement 9: Medical & Grooming Requests

**User Story:** As an owner-level user, I want to submit medical or grooming requests for a cat, so that verified partners can provide care reimbursed from the community pool.

#### Acceptance Criteria

1. WHEN a User who is Lvl1+ Owner of a Cat submits a MedicalRequest, THE System SHALL accept the request and start a Temporal_Worker workflow for that request.
2. WHEN a User who is NOT a Lvl1+ Owner attempts to submit a MedicalRequest, THE System SHALL reject the request with a 403 authorization error.
3. WHEN a MedicalRequest workflow is started, THE System SHALL route the request to Staff-Verification for review.
4. WHEN Staff-Verification approves a MedicalRequest, THE System SHALL notify the assigned Partner and update the request status to "in_progress".
5. WHEN Staff-Verification rejects a MedicalRequest, THE System SHALL update the request status to "rejected" and notify the requesting User.
6. WHEN a Partner signals service completion with a valid invoice, THE System SHALL update the request status to "reimbursed" and release the reimbursement amount from the pool.
7. WHEN a Partner's invoice is found invalid during verification, THE System SHALL update the request status to "rejected" and notify the requesting User.
8. WHEN the Partner has not signalled completion within 7 days, THE Temporal_Worker SHALL time out the workflow and update the request status to "rejected".
9. THE System SHALL store MedicalRequest supporting documents in private object storage with signed URL access.

---

### Requirement 10: Donation & Wallet

**User Story:** As a user, I want to purchase food items and donate them to cats, so that my contribution is financially tracked and rewarded.

#### Acceptance Criteria

1. WHEN a User initiates a wallet top-up, THE System SHALL route the payment through security scanning (Aikido if free tier is available, otherwise `npm audit` + Trivy) before calling the payment gateway.
2. WHEN a payment gateway SANDBOX transaction succeeds, THE System SHALL credit the User's walletBalance by the paid amount in MYR cents.
3. WHEN a User purchases a food item, THE System SHALL store the purchased item quantity in the User's inventory and SHALL NOT directly trigger a donation.
4. WHEN a User submits a food donation from their inventory, THE System SHALL deduct one unit of the donated food item from the User's inventory and create a Donation record.
5. IF a User attempts to donate a food item they do not have in their inventory, THEN THE System SHALL reject the transaction and SHALL NOT create a Donation record.
6. WHEN a food donation is accepted, THE System SHALL start a Temporal_Worker DonationEscrow workflow that holds the item value for 24 hours before releasing it to the cat's care pool.
7. WHEN the DonationEscrow workflow releases funds, THE System SHALL award XP to the donor per Requirement 6.3.
8. THE System SHALL store wallet balances as integer MYR cents to avoid floating-point rounding errors.
9. WHEN a payment webhook is received from the payment gateway, THE System SHALL validate the webhook signature before processing the event.

---

### Requirement 11: WebAR Feeding Experience

**User Story:** As a user, I want to see an AR animation when I feed a cat, so that the donation feels rewarding and immersive.

#### Acceptance Criteria

1. WHEN a Lvl0+ User taps "Feed Cat" on a discovered Cat's profile, THE System SHALL open a WebAR experience inside a React Native WebView.
2. WHEN the WebAR experience completes, THE System SHALL receive a `feedingComplete` event from the WebView and SHALL trigger the food donation workflow.
3. WHEN the WebView fails to load the WebAR page, THE System SHALL fall back to a standard donation confirmation screen, regardless of WebAR completion status.

---

### Requirement 12: Push Notifications (Alerts)

**User Story:** As a user, I want push notifications for key events related to my cats, so that I stay informed about cats I own.

#### Acceptance Criteria

1. WHEN a User reaches Lvl1 Ownership for a Cat, THE System SHALL send a push notification to that User via FCM or APNs.
2. WHEN the status of a MedicalRequest changes, THE System SHALL send a push notification to all Lvl1+ Owners of the associated Cat.
3. WHEN a food donation is released from escrow, THE System SHALL send a push notification to all Lvl1+ Owners of the associated Cat.
4. WHEN a new Sighting is recorded for a Cat, THE System SHALL send a push notification to all Lvl1+ Owners of that Cat.
5. THE System SHALL rate-limit push notifications to a maximum of 10 notifications per User per hour, including critical notifications such as ownership milestones and medical updates.

---

### Requirement 13: Partner Management

**User Story:** As a staff member, I want to register and verify partner clinics and salons, so that medical and grooming requests can be routed to trusted providers.

#### Acceptance Criteria

1. THE System SHALL provide a staff-only API endpoint for creating and verifying Partner records.
2. WHEN a staff member verifies a Partner, THE System SHALL set the Partner's verified flag to true and make the Partner selectable for MedicalRequests.
3. WHEN a MedicalRequest workflow requires a partner assignment, THE System SHALL only select Partners with verified = true.
4. WHEN a Partner's verified status is revoked, THE System SHALL immediately block that Partner from being assigned to new MedicalRequests without a grace period.

---

### Requirement 14: Cat Profile Screen

**User Story:** As a user, I want a unified cat profile screen that shows all information and actions for a specific cat, so that I have a single place to view details, contribute, and interact.

#### Acceptance Criteria

1. WHEN a User navigates to a Cat Profile (via map pin tap, scan result, or Catpedia entry), THE System SHALL display the Cat's name, photo, sighting history, and last-known approximate area.
2. WHEN a User views a Cat Profile, THE System SHALL display the User's current ownership level and XP progress bar for that Cat.
3. WHEN a Lvl0+ User views a Cat Profile, THE System SHALL display a "Feed Cat" button that opens the WebAR feeding experience.
4. WHEN a User views a Cat Profile, THE System SHALL display the Owner Leaderboard showing all Lvl1+ Owners of that Cat ranked by cumulative per-cat XP.
5. THE Owner Leaderboard SHALL display each owner's display name, ownership level, cumulative XP, and rank position.
6. THE Owner Leaderboard SHALL be visible to any User who has discovered the Cat (Lvl0+).
7. WHEN a User who has NOT discovered the Cat attempts to view the Cat Profile, THE System SHALL display only the silhouette and approximate area, without the leaderboard or action buttons.

---

### Requirement 15: Security & Data Integrity

**User Story:** As a system operator, I want the payment and donation surfaces to be security-scanned and the data model to maintain consistency, so that the app is safe for financial transactions.

#### Acceptance Criteria

1. THE System SHALL run security scanning (Aikido if free tier is available, otherwise `npm audit` + Trivy) on all payment and donation API endpoints.
2. THE System SHALL store all raw GPS coordinates only server-side and SHALL serve only GPS_Fuzz coordinates to client applications.
3. THE System SHALL enforce that an Ownership record can only exist for a user–cat pair if a corresponding UserCatDiscovery record also exists; a UserCatDiscovery record MAY exist without a corresponding Ownership record.
4. WHEN a Temporal_Worker workflow is re-triggered with the same workflowId after a partial failure, THE System SHALL resume execution from the last successfully completed checkpoint rather than restarting from the beginning, and SHALL produce the same final financial outcome.
5. THE System SHALL sign and verify all payment gateway webhook payloads before processing.
6. THE System SHALL use short-lived JWT access tokens (15-minute expiry) with rotating refresh tokens.
