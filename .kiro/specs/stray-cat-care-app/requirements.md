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
- **Wallet**: (Removed — the app does not maintain an in-app wallet; purchases go directly through the payment gateway at checkout.)
- **MedicalRequest**: A request by an Owner (Lvl7+) for veterinary or grooming care for a cat, subject to three-party verification.
- **Temporal_Worker**: The Temporal workflow engine that executes durable, multi-step workflows.
- **Partner**: A verified veterinary clinic or pet grooming salon that has been registered and verified by the app's staff team; collaborates with CodingKitty to provide reimbursable medical/grooming services to stray cats.
- **XP**: Experience points accumulated by a User per cat or globally.
- **Undiscovered User**: A User who has never scanned a particular Cat; can only see the Cat's silhouette and approximate area on the map or in Catpedia.
- **Discovered User (Lvl0)**: A User who has scanned and registered a Cat in their Catpedia; can view the Cat's name, photo, description, sighting history, and a teaser of the owner community chat, but cannot send messages or access the full chat.
- **Owner User (Lvl1+)**: A User whose cumulative per-cat XP has reached ownership threshold; has full access to the Cat's community chat and receives notifications. Medical/grooming request submission unlocks separately at Lvl7+ (see Requirements 8.3, 17.7).
- **GPS_Fuzz**: A ±100–200 m random offset applied to raw GPS coordinates before storage or transmission to clients.
- **Aikido**: Third-party security scanning service wrapping payment/donation API surfaces (optional — used only if free tier is available; otherwise replaced by `npm audit` + Trivy).
- **YOLO**: Ultralytics YOLO model used for cat detection and crop.
- **MegaDescriptor**: Pre-trained wildlife re-identification model (HuggingFace, MegaDescriptor-T-224) producing a 768-dim embedding.
- **pgvector**: PostgreSQL extension for storing and querying cat embedding vectors.
- **WebAR**: Browser-based augmented reality experience loaded inside a React Native WebView.
- **Inactivity Period**: 8 consecutive months without any donation or daily scan for a specific Cat, triggering ownership revocation.
- **Badge**: A visual achievement indicator displayed on a User's profile, earned through milestones (discovery count, level-ups, etc.).
- **Level Reward**: A one-time reward granted to a User upon reaching a specific ownership level for a Cat.

---

## Requirements

### Requirement 1: Onboarding Permissions

**User Story:** As a first-time user, I want to be asked for location and camera permissions with a clear explanation, so that I understand why the app needs access before granting it.

#### Acceptance Criteria

1. WHEN a first-time User opens the app, THE System SHALL display a permissions explanation screen before requesting OS-level location permission, regardless of whether the permission has already been granted through system settings or a previous install.
2. WHEN a first-time User opens the app, THE System SHALL display a permissions explanation screen before requesting OS-level camera permission, regardless of whether the permission has already been granted through system settings or a previous install.
3. IF a User denies location permission, THEN THE System SHALL display a message explaining that map functionality is limited; THE System SHALL disable the live map only after the explanation message is successfully displayed. IF the explanation message fails to display, THE System SHALL keep the map enabled to avoid confusing users.
4. IF a User denies camera permission, THEN THE System SHALL display a message explaining that scanning is unavailable and SHALL disable the scan button.

---

### Requirement 2: Live Map Display

**User Story:** As a user, I want to see stray cats on a live map, so that I can find and discover cats near me.

#### Acceptance Criteria

1. WHEN a User opens the map view, THE System SHALL display Cat pins at their last-known approximate location, using GPS_Fuzz coordinates.
2. WHEN a Cat has been discovered by the current User, THE System SHALL render that Cat's pin as a revealed icon; pin type SHALL always be derived from the current discovery status to enforce consistency.
3. WHEN a Cat has NOT been discovered by the current User, THE System SHALL render that Cat's pin as a silhouette icon; pin type SHALL always be derived from the current discovery status to enforce consistency.
4. WHEN a User taps a silhouette pin, THE System SHALL display only the Cat's approximate area and SHALL NOT reveal the Cat's name, photo, or profile; other non-identifying details such as distinctive markings or collar colors MAY be included in the approximate area display.
5. WHEN a User taps a revealed Cat pin, THE System SHALL navigate to that Cat's full profile page and SHALL always display the full profile information including name, photo, description, sighting history, and action buttons.
6. THE System SHALL target updating Cat pin positions on the map within 60 seconds of a new Sighting being recorded; late updates SHALL be accepted and applied when received.

---

### Requirement 3: Cat Scanning — Detection Stage

**User Story:** As a user, I want to scan a cat with my camera, so that the system can identify it.

#### Acceptance Criteria

1. WHEN a User submits a photo via the scan interface, THE System SHALL pass the photo to YOLO for cat detection before any re-identification step.
2. WHEN YOLO detects no cat in the submitted photo, THE System SHALL return an error response, SHALL prompt the User to retake the photo, and SHALL strictly halt all further processing steps including cropping and re-identification.
3. WHEN YOLO detects a cat in the submitted photo, THE System SHALL crop the detected region and proceed to the re-identification stage regardless of whether the detection step exceeded the 5-second target.
4. THE System SHALL target completing the YOLO detection step within 5 seconds of photo submission under normal network conditions; exceeding the 5-second target SHALL NOT prevent the System from proceeding to re-identification when a cat is detected.

---

### Requirement 4: Cat Re-Identification — MegaDescriptor Stage

**User Story:** As a user, I want the system to recognize whether the cat I scanned is already known, so that I get credit for discovering or re-sighting an existing cat.

#### Acceptance Criteria

1. WHEN a cropped cat image passes YOLO detection, THE System SHALL pass it to MegaDescriptor to generate a 768-dimensional embedding.
2. WHEN an embedding is generated, THE System SHALL query pgvector for the nearest existing Cat embedding using cosine similarity.
3. WHEN a User who has NOT discovered the matched Cat scans it AND the nearest-neighbour similarity score is ≥ the auto-match threshold (configurable, default 0.85), THE System SHALL auto-confirm the match and register the discovery without requiring a user confirmation prompt.
4. WHEN a User who IS an Owner (Lvl1+) of the matched Cat scans it AND the nearest-neighbour similarity score is ≥ the confirm threshold (configurable, default 0.5), THE System SHALL present the candidate Cat to the User with a confirmation prompt ("Is this <Cat>?") and SHALL await the User's response before proceeding.
5. WHEN a User who has discovered (Lvl0) but does not own the matched Cat scans it AND the nearest-neighbour similarity score is ≥ the auto-match threshold (configurable, default 0.85), THE System SHALL auto-confirm the match without requiring a user confirmation prompt.
6. WHEN the nearest-neighbour similarity score is < the confirm threshold (configurable, default 0.5) OR no embeddings exist in the database, THE System SHALL register a new Cat record with the embedding and the current User as firstDiscoverer.
7. WHEN a User confirms a match via prompt, THE System SHALL treat the interaction as a confirmed match for all subsequent steps.
8. WHEN a User rejects a match via prompt, THE System SHALL register a new Cat as in criterion 6.
9. WHEN a scan results in a confirmed or auto-confirmed match, THE System SHALL offer the User the option to upload the scanned photo to the Cat's community chat (accessible only if the User is Lvl1+ Owner).

---

### Requirement 5: Sighting Recording & Location Update

**User Story:** As a user, I want my scan to be recorded as a sighting and update the cat's known location, so that the community has fresh location data.

#### Acceptance Criteria

1. WHEN a scan results in a confirmed match (high-confidence, auto-confirmed, or user-confirmed), THE System SHALL create a Sighting record with the fuzzed GPS coordinates of the scanning User's device at the time of scan.
2. WHEN a scan results in a new Cat registration, THE System SHALL create a Sighting record for the new Cat using the scanning User's device location.
3. WHEN a Sighting record is created, THE System SHALL always apply GPS_Fuzz to the raw GPS coordinates before persisting or transmitting them to protect user privacy.
4. IF GPS_Fuzz processing is unavailable for a Sighting, THEN THE System SHALL create the Sighting record with a null location value rather than blocking creation or storing raw coordinates.
5. WHEN a Sighting is recorded for an existing Cat, THE System SHALL update that Cat's lastKnownApproxLocation using only fuzzed coordinates from the new Sighting; location updates from confirmed scans SHALL be processed regardless of concurrent chat activity by the User.
6. THE System SHALL store raw GPS coordinates only in the server-side database and SHALL never transmit raw coordinates to any client.
7. THE System SHALL update a Cat's lastKnownApproxLocation ONLY from registered scan Sightings and SHALL NOT update location based on community chat messages or any other non-scan interaction.

---

### Requirement 6: Gamification — XP & Ownership Progression

**User Story:** As a user, I want to earn XP for caring for cats, so that I can become an owner and unlock additional features.

#### Acceptance Criteria

1. WHEN a User's scan results in discovering a cat for the first time (new Cat registration), THE System SHALL award 100 XP to that User's global total and to their per-cat XP for that Cat.
2. WHEN a User's scan results in re-sighting an existing Cat, THE System SHALL award 3 XP to that User's per-cat XP for that Cat (once per unique daily scan per cat).
3. WHEN a User donates a food item to a Cat, THE System SHALL award XP equal to the MYR price of the donated item (e.g., 1 RM item = 1 XP, 5 RM item = 5 XP, 10 RM item = 10 XP) to that User's per-cat XP for that Cat, up to a maximum of 200 XP per User per Cat per day from donations.
4. WHEN a MedicalRequest reaches "reimbursed" status, THE System SHALL award 100 XP to the requesting User's per-cat XP for that Cat.
5. WHEN a User's cumulative per-cat XP for a specific Cat reaches or exceeds the threshold for the next ownership level, THE System SHALL promote that User's Ownership level for that Cat by one.
6. THE System SHALL use the following cumulative XP thresholds for ownership levels: Lvl0 = Discovered (0 XP), Lvl1 = Owner (1 XP cumulative), Lvl2 (6 XP cumulative), Lvl3 (16 XP cumulative), Lvl4 (31 XP cumulative), Lvl5 (51 XP cumulative), with each subsequent level requiring an additional 5 XP more than the previous level's increment, up to a maximum of Lvl10.
7. THE System SHALL track the total cumulative per-cat XP earned by a User across all levels; levelling up SHALL NOT reset the XP counter to zero, and accumulated XP SHALL remain visible to the User at all times.
8. THE System SHALL allow XP to accumulate beyond Lvl10 threshold indefinitely; XP earned above Lvl10 SHALL count toward leaderboard ranking but SHALL NOT unlock additional levels.
9. WHEN a User is promoted to Lvl1 for a Cat, THE System SHALL create an Ownership record if one does not exist and SHALL send the User a push notification only after both the promotion and the ownership record creation are successfully committed to the database.
10. THE System SHALL maintain a UserCatDiscovery record independently from the Ownership record; promoting to Lvl1 SHALL NOT delete the UserCatDiscovery record, and a UserCatDiscovery record MAY exist without a corresponding Ownership record.

---

### Requirement 7: Catpedia

**User Story:** As a user, I want to browse all registered cats in a catalogue, so that I can see which cats I've discovered or own.

#### Acceptance Criteria

1. THE System SHALL provide a Catpedia view listing all registered Cats.
2. WHEN a User views the Catpedia, THE System SHALL support three filter modes: "All", "Stray" (Lvl0 discovered but not owned), and "Pet" (Lvl1+ owned).
3. WHEN a Cat in Catpedia has NOT been discovered by the current User (Undiscovered User), THE System SHALL render that Cat as a locked silhouette, hide the Cat's name, and SHALL NOT display its photo.
4. WHEN a Cat in Catpedia has been discovered by the current User (Discovered User or Owner User), THE System SHALL always display that Cat's name and photo regardless of the viewing context, applied filters, or UI space constraints.
5. THE System SHALL provide a "Nearby Cats" search in Catpedia that reveals silhouettes of undiscovered Cats within 100 m of the User's current location based on the Cat's last known registered scan location.
6. WHEN an Undiscovered User taps a Cat silhouette entry in Catpedia or from the Nearby search, THE System SHALL display only the Cat's approximate area and SHALL NOT reveal identifying details.

---

### Requirement 8: Community Chat

**User Story:** As an owner-level user, I want to chat with other owners of a cat in a group chat, so that we can coordinate care and share updates.

#### Acceptance Criteria

1. WHEN a User is Lvl1+ Owner of a Cat, THE System SHALL display the community chat interface (group chat) and allow that User to read messages and send new messages for that Cat.
2. WHEN a User who is NOT a Lvl1+ Owner of a Cat attempts to access, read, or send a message in that Cat's chat, THE System SHALL reject the request with a 403 authorization error and SHALL NOT display the chat interface.
3. WHEN an Owner sends a message, THE System SHALL persist the ChatMessage first; only after successful persistence SHALL the System broadcast the message to all other online Owners of that Cat in real time.
4. WHEN a User is promoted to Lvl1 for a Cat, THE System SHALL automatically unlock the chat interface for that Cat without requiring a page refresh.
5. THE System SHALL support image sharing in the community chat, allowing Owners to upload scanned photos or other images of the Cat.
6. WHEN a Discovered User (Lvl0) views a Cat Profile, THE System SHALL display a blurred/teaser preview of 1–2 recent messages from the community chat to show the type of content available to Owners.

---

### Requirement 9: Medical & Grooming Requests

**User Story:** As a high-level owner, I want to submit medical or grooming requests for a cat, so that verified partner clinics/salons can provide care reimbursed from the community pool after a three-party verification.

#### Acceptance Criteria

1. WHEN a User who is Lvl7+ Owner of a Cat submits a MedicalRequest, THE System SHALL accept the request and start a Temporal_Worker workflow for that request.
2. WHEN a User who is below Lvl7 for a Cat attempts to submit a MedicalRequest, THE System SHALL reject the request with a 403 authorization error.
3. WHEN a User below Lvl7 views a Cat Profile, THE System SHALL display the medical/grooming request option as greyed out and locked with a message stating "Available after Level 7".
4. WHEN a User submits a MedicalRequest, THE System SHALL require the User to provide a reason description and supporting documentation (photos, vet notes).
5. WHEN a MedicalRequest workflow is started, THE System SHALL route the request to the review team (Staff-Verification) for review.
6. WHEN Staff-Verification approves a MedicalRequest, THE System SHALL send confirmation to both the requesting User and the assigned Partner (verified clinic/salon), including appointment details.
7. WHEN Staff-Verification rejects a MedicalRequest, THE System SHALL update the request status to "rejected" and notify the requesting User with a reason.
8. WHEN both the User and the Partner confirm the appointment has been completed, THE System SHALL require the Partner to submit an invoice and the User to submit a receipt; THE System SHALL block the request from progressing to "reimbursed" status until both documents are actually submitted. WHEN valid documents are submitted after a request has been previously rejected for documentation reasons, THE System SHALL allow the request status to transition from "rejected" to "reimbursed".
9. WHEN the review team receives valid documentation from both Partner and User confirming service completion, THE System SHALL update the request status to "reimbursed" and release the reimbursement amount from the pool to the User.
10. WHEN documentation from the Partner or User is found invalid during verification, THE System SHALL update the request status to "rejected" and notify the requesting User.
11. WHEN the Partner has not signalled completion within 7 days, THE Temporal_Worker SHALL time out the workflow and update the request status to "timed_out".
12. THE System SHALL store MedicalRequest supporting documents in private object storage with signed URL access.
13. THE System SHALL notify the User of certified Partner locations (verified vet clinics and grooming salons) in the area when they initiate a MedicalRequest; reimbursement SHALL only be processed if the User visits one of these certified Partners.

---

### Requirement 10: Donation & Item Purchase

**User Story:** As a user, I want to purchase food items and donate them to cats, so that my contribution is financially tracked and rewarded.

#### Acceptance Criteria

1. WHEN a User selects food items for purchase (cat kibble, cat snack, tuna can), THE System SHALL display a checkout screen showing selected items, quantities, and the total amount in MYR.
2. WHEN a User confirms checkout, THE System SHALL route the exact total amount to the payment gateway for immediate payment (no in-app wallet); the User pays the exact amount at checkout.
3. WHEN a payment gateway SANDBOX transaction succeeds, THE System SHALL store the purchased item quantities in the User's inventory (donation items ready for use).
4. THE System SHALL display the total credit value of all purchased items currently in the User's inventory below the item list on the donation screen.
5. WHEN a User submits a food donation from their inventory, THE System SHALL deduct one unit of the donated food item from the User's inventory and create a Donation record.
6. IF a User attempts to donate a food item they do not have in their inventory at the time of the donation attempt, THEN THE System SHALL reject the transaction, SHALL NOT create a Donation record, and SHALL NOT persist any record of the rejected transaction.
7. WHEN a food donation is accepted, THE System SHALL start a Temporal_Worker DonationEscrow workflow that holds the item value for 24 hours before releasing it to the cat's care pool.
8. WHEN a food donation is accepted (inventory deducted and Donation record created), THE System SHALL immediately award XP to the donor per Requirement 6.3 and SHALL return the XP result in the donation response so the app can confirm the feeding instantly; the DonationEscrow workflow SHALL release only the funds to the cat's care pool.
9. WHEN a payment webhook is received from the payment gateway, THE System SHALL validate the webhook signature before processing the event.
10. THE System SHALL route the payment through security scanning (Aikido if free tier is available, otherwise `npm audit` + Trivy) before calling the payment gateway.

---

### Requirement 11: WebAR Feeding Experience

**User Story:** As a user, I want to see an AR animation when I feed a cat, so that the donation feels rewarding and immersive.

#### Acceptance Criteria

1. WHEN a Lvl0+ User who has successfully scanned a Cat taps "Feed Cat" on that Cat's profile, THE System SHALL open a WebAR experience inside a React Native WebView.
2. WHEN the WebAR experience completes, THE System SHALL receive a `feedingComplete` event from the WebView and SHALL trigger the food donation workflow.
3. WHEN the WebView fails to load the WebAR page OR the AR content fails to initialize within the WebView, THE System SHALL fall back to a standard donation confirmation screen.
4. THE System SHALL allow food donation to proceed without the WebAR experience; Users SHALL be able to donate via a simple UI button ("Donate Food") on the Cat Profile regardless of WebAR availability.
5. THE WebAR feature SHALL be treated as an optional enhancement; WebAR failure or absence SHALL NOT prevent any donation functionality, though other factors (e.g., insufficient inventory) may still block donations independently.

---

### Requirement 12: Push Notifications (Alerts)

**User Story:** As a user, I want push notifications for key events related to my cats, so that I stay informed about cats I own.

#### Acceptance Criteria

1. WHEN a User reaches Lvl1 Ownership for a Cat, THE System SHALL send a push notification to that User via FCM or APNs only after the ownership level has been successfully committed to the database.
2. WHEN the status of a MedicalRequest changes, THE System SHALL send a push notification to all Lvl1+ Owners of the associated Cat only when at least one Lvl1+ Owner exists.
3. WHEN a food donation is released from escrow, THE System SHALL send a push notification to all Lvl1+ Owners of the associated Cat only when at least one Lvl1+ Owner exists.
4. WHEN a new Sighting is recorded for a Cat, THE System SHALL send a push notification to all Lvl1+ Owners of that Cat only when at least one Lvl1+ Owner exists.
5. THE System SHALL rate-limit push notifications to a maximum of 10 notifications per User per hour; ownership milestone notifications SHALL bypass this rate limit to ensure Users always receive promotion alerts.

---

### Requirement 13: Partner Management

**User Story:** As a staff member, I want to register and verify partner clinics and salons, so that medical and grooming requests can be routed to trusted providers.

#### Acceptance Criteria

1. THE System SHALL provide a staff-only API endpoint for creating and verifying Partner records.
2. WHEN a staff member verifies a Partner through the staff-only API endpoint, THE System SHALL set the Partner's verified flag to true and make the Partner selectable for MedicalRequests; no other mechanism (automated processes, data imports, or batch operations) SHALL make a Partner selectable.
3. WHEN a MedicalRequest workflow requires a partner assignment, THE System SHALL only select Partners with verified = true.
4. WHEN a Partner's verified status is revoked, THE System SHALL clear the Partner's verified flag and immediately block that Partner from being assigned to new MedicalRequests without a grace period.
5. THE System SHALL store Partner details including clinic/salon name, address, service types offered (veterinary, grooming, or both), and contact information.
6. WHEN a User initiates a MedicalRequest, THE System SHALL display a list of verified Partners in the User's area for the User to select as their service destination.

---

### Requirement 14: Cat Profile Screen

**User Story:** As a user, I want a unified cat profile screen that shows all information and actions for a specific cat, so that I have a single place to view details, contribute, and interact.

#### Acceptance Criteria

1. WHEN a Discovered User or Owner User navigates to a Cat Profile (via map pin tap, scan result, or Catpedia entry), THE System SHALL display the Cat's name, the first photo uploaded when the Cat was registered, sighting history, last-known approximate area on the map (displayed regardless of the User's location permission status), and a description provided by owners.
2. WHEN a Discovered User (Lvl0) views a Cat Profile, THE System SHALL display a teaser preview of 1–2 recent messages from the owner community chat, but SHALL NOT allow the Discovered User to send messages or access the full chat interface; THE System SHALL display the Cat's first registered photo but SHALL NOT grant access to the community chat until the User reaches Lvl1.
3. WHEN a User views a Cat Profile, THE System SHALL display the User's current ownership level and XP progress bar for that Cat.
4. WHEN a Lvl0+ User views a Cat Profile, THE System SHALL display a "Feed Cat" button that opens the WebAR feeding experience.
5. WHEN a User who has discovered the Cat (Lvl0+) views a Cat Profile, THE System SHALL display the Owner Leaderboard showing all Lvl1+ Owners of that Cat ranked by cumulative per-cat XP; IF no Lvl1+ Owners exist, THE System SHALL display an empty leaderboard with a "No owners yet" message.
6. THE Owner Leaderboard SHALL display each owner's display name, ownership level, cumulative XP, and rank position; ranking by cumulative XP is sufficient since the XP system guarantees that higher-level owners always have higher cumulative XP. WHEN an Owner loses their discovery status and drops to UNDISCOVERED level, THE System SHALL remove that Owner from the leaderboard regardless of accumulated XP.
7. THE Owner Leaderboard SHALL be visible to any User who has discovered the Cat (Lvl0+); Undiscovered Users SHALL NOT see the leaderboard.
8. WHEN an Undiscovered User attempts to view the Cat Profile, THE System SHALL display only the silhouette and approximate area, without the name, photo, leaderboard, chat teaser, or action buttons; this restriction applies to display elements only and does not affect backend permissions.

---

### Requirement 15: Security & Data Integrity

**User Story:** As a system operator, I want the payment and donation surfaces to be security-scanned and the data model to maintain consistency, so that the app is safe for financial transactions.

#### Acceptance Criteria

1. THE System SHALL run security scanning (Aikido if free tier is available, otherwise `npm audit` + Trivy) on all payment and donation API endpoints.
2. THE System SHALL store all raw GPS coordinates only server-side and SHALL serve only GPS_Fuzz coordinates to client applications.
3. THE System SHALL enforce that an Ownership record can only exist for a user–cat pair if a corresponding UserCatDiscovery record also exists; a UserCatDiscovery record MAY exist without a corresponding Ownership record.
4. WHEN a Temporal_Worker workflow is re-triggered with the same workflowId after a partial failure, THE System SHALL resume execution from the last successfully completed checkpoint rather than restarting from the beginning, and SHALL produce the same final financial outcome.
5. THE System SHALL verify the signature of all payment gateway webhook payloads as a mandatory precondition before any processing begins; payloads SHALL NOT be processed until signature verification succeeds.
6. THE System SHALL use short-lived JWT access tokens (15-minute expiry enforced exactly with no tolerance) with rotating refresh tokens.

---

### Requirement 16: Inactivity & Ownership Revocation

**User Story:** As a system operator, I want inactive owners to have their ownership access revoked after prolonged inactivity, so that only active contributors retain owner privileges.

#### Acceptance Criteria

1. WHEN an Owner User (Lvl1+) has not performed any donation or daily scan for a specific Cat for 8 consecutive months, THE System SHALL revoke that User's ownership access for that Cat.
2. WHEN ownership is revoked due to inactivity, THE System SHALL retain the User's historical level record but SHALL disable all owner privileges (community chat access, notifications, medical request submission) for that Cat.
3. WHEN ownership is revoked due to inactivity, THE System SHALL revert the User's status for that Cat to Discovered (Stray) — the UserCatDiscovery record SHALL remain intact.
4. WHEN a revoked User re-scans the Cat, THE System SHALL restore the User's previously attained ownership level and SHALL explicitly re-enable all individual privileges (community chat access, notifications, medical request submission) without requiring the User to re-earn XP.
5. THE System SHALL send a push notification to the User 30 days before the 8-month inactivity threshold is reached, warning of impending ownership revocation.
6. THE System SHALL run a daily background job to check for Users who have exceeded the 8-month inactivity threshold and process revocations in batch.

---

### Requirement 17: Level Rewards

**User Story:** As an owner, I want to receive rewards when I level up for a cat, so that I feel incentivized to keep contributing.

#### Acceptance Criteria

1. WHEN a User reaches Lvl1 for a Cat, THE System SHALL grant the User ownership access (community chat, notifications).
2. WHEN a User reaches Lvl2 for a Cat, THE System SHALL grant the User a discount coupon of RM 3 off with a minimum purchase of RM 10 on donation items.
3. WHEN a User reaches Lvl3 for a Cat, THE System SHALL grant the User a custom bronze badge featuring the Cat's image.
4. WHEN a User reaches Lvl4 for a Cat, THE System SHALL grant the User one free cat kibble item added to their donation inventory.
5. WHEN a User reaches Lvl5 for a Cat, THE System SHALL replace the bronze badge with a silver badge featuring the Cat's image.
6. WHEN a User reaches Lvl6 for a Cat, THE System SHALL grant the User one free cat snack item added to their donation inventory.
7. WHEN a User reaches Lvl7 for a Cat, THE System SHALL unlock access to medical/grooming request submission for that Cat AND SHALL replace the silver badge with a gold badge featuring the Cat's image.
8. WHEN a User reaches Lvl8 for a Cat, THE System SHALL grant the User a discount coupon of RM 10 off with a minimum purchase of RM 30 on donation items.
9. WHEN a User reaches Lvl9 for a Cat, THE System SHALL grant the User one free tuna can item (worth RM 10) added to their donation inventory.
10. WHEN a User reaches Lvl10 for a Cat, THE System SHALL grant the User a shiny diamond badge featuring the Cat's image in the centre AND SHALL notify the app team to produce a custom engraved keychain/tag with the Cat's name for the User.
11. THE System SHALL display earned level rewards and active discount coupons in the User's profile.
12. Discount coupons SHALL be single-use and SHALL expire 30 days after being granted if unused.

---

### Requirement 18: Badges & Achievements

**User Story:** As a user, I want to earn achievement badges for reaching milestones, so that I can showcase my contributions on my profile.

#### Acceptance Criteria

1. THE System SHALL award achievement badges to Users when they reach predefined milestones (e.g., "Discovered 10 Cats", "Discovered 50 Cats", "First Donation", "100 Total Donations").
2. WHEN a User earns a badge, THE System SHALL send a push notification and display a congratulatory animation in the app.
3. THE System SHALL display all earned badges on the User's public profile in a badge showcase section; the badge showcase section SHALL always be visible when badges are displayed.
4. THE System SHALL support both global badges (based on aggregate activity across all Cats) and per-cat badges (level badges from Requirement 17).
5. WHEN a User earns a per-cat level badge (bronze, silver, gold, diamond), THE System SHALL display the highest-tier badge for each Cat on the User's profile; lower-tier badges for the same Cat SHALL be replaced.
6. THE System SHALL provide a badge catalogue screen where Users can view all available badges, their unlock criteria, and their current progress toward each.

---

### Requirement 19: Cat Name Content Moderation

**User Story:** As a system operator, I want cat names to be moderated for inappropriate content, so that the community remains safe and welcoming for all users.

#### Acceptance Criteria

1. WHEN a User submits a name for a newly discovered Cat, THE System SHALL validate the name against a profanity/explicit-content filter before accepting it.
2. IF a submitted Cat name contains explicit, offensive, or inappropriate words, THEN THE System SHALL reject the name and display an error message asking the User to choose a more appropriate name.
3. THE System SHALL maintain a blocklist of prohibited words and phrases (including common variations, leetspeak substitutions, and multi-language profanity relevant to Malaysia — Malay, English, Chinese, Tamil).
4. THE System SHALL enforce a Cat name length between 2 and 30 characters.
5. THE System SHALL reject Cat names that consist only of special characters, numbers, or whitespace.
6. WHEN a Cat name passes the content filter, THE System SHALL store it and make it visible to all Users who have discovered that Cat; invalid names SHALL never be stored or made visible.
7. THE System SHALL only allow the first discoverer (who is automatically converted to Lvl3 Owner upon registration) to set the Cat's name during initial registration. IF the first discoverer wishes to rename a Cat after initial registration, THE System SHALL apply the same content moderation rules to the new name before accepting the change; non-first-discoverers SHALL NOT be permitted to rename the Cat.
8. THE System SHALL allow the review team to override or rename a Cat if a name is later reported as inappropriate by other Users.
