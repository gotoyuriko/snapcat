import { PrismaClient } from '@prisma/client';
import { Cat, OrchestrationResult } from '@codingkitty/shared';
import { YoloClient } from './yolo.client';
import { MegaDescriptorClient } from './megadescriptor.client';
import { VectorService } from './vector.service';
import { GamificationService } from '../gamification/gamification.service';
import { fuzzCoordinates } from '../sighting/gps-fuzz';
import { config } from '../../config';

/** Similarity thresholds for cat re-identification (tunable via env — see config/index.ts) */
const MATCH_THRESHOLD = config.recognition.matchThreshold;
const CONFIRM_THRESHOLD = config.recognition.confirmThreshold;

export interface RawGPS {
  lat: number;
  lng: number;
}

/**
 * RecognitionService — orchestrates the full cat recognition pipeline:
 * YOLO detection → MegaDescriptor embedding → pgvector similarity search → sighting/gamification.
 */
export class RecognitionService {
  private readonly gamificationService: GamificationService;

  constructor(
    private readonly yoloClient: YoloClient,
    private readonly megaDescriptorClient: MegaDescriptorClient,
    private readonly vectorService: VectorService,
    private readonly prisma: PrismaClient,
    gamificationService?: GamificationService,
  ) {
    this.gamificationService = gamificationService ?? new GamificationService(prisma);
  }

  /**
   * Main orchestrator: detect → embed → match → record.
   *
   * @param photo - Raw image buffer from the user's camera
   * @param userGPS - The user's current GPS coordinates
   * @param userId - The authenticated user's ID
   * @param photoUrl - URL of the already-uploaded scan photo, if any
   * @returns Discriminated union OrchestrationResult
   */
  async recognizeCat(
    photo: Buffer,
    userGPS: RawGPS,
    userId: string,
    photoUrl?: string,
  ): Promise<OrchestrationResult> {
    // Stage 1: YOLO cat detection
    const detection = await this.yoloClient.detectCat(photo);

    if ('noDetection' in detection) {
      // No cat found — strictly halt all processing
      return { result: 'no_cat' };
    }

    // Stage 2: Generate embedding from cropped cat image
    const embeddingFloat = await this.megaDescriptorClient.embed(detection.cropped);
    const embedding = Array.from(embeddingFloat);

    // Stage 3: Find nearest cat by vector similarity
    const matches = await this.vectorService.findNearestCat(embedding);
    const bestMatch = matches.length > 0 ? matches[0] : null;

    // Apply thresholds
    if (bestMatch && bestMatch.similarity >= MATCH_THRESHOLD) {
      // High confidence match
      return this.handleMatch(bestMatch.catId, bestMatch.similarity, embedding, userId, userGPS, photoUrl);
    } else if (bestMatch && bestMatch.similarity >= CONFIRM_THRESHOLD) {
      // Borderline — ask user to confirm
      return this.handleConfirmNeeded(bestMatch.catId, embedding, photoUrl ?? '');
    } else {
      // Low similarity or no matches — register new cat
      return this.handleNewCat(embedding, userId, userGPS, photoUrl);
    }
  }

  /**
   * Confirm a match after user verification (POST /scan/confirm flow).
   *
   * @param userId - The authenticated user's ID
   * @param catId - UUID of the cat to confirm, or "new" to register a new cat
   * @param embedding - The embedding from the original scan
   * @param rawGPS - The user's GPS coordinates
   * @param photoUrl - URL of the uploaded photo
   * @returns OrchestrationResult
   */
  async confirmMatch(
    userId: string,
    catId: string | 'new',
    embedding: number[],
    rawGPS: RawGPS,
    photoUrl: string,
  ): Promise<OrchestrationResult> {
    if (catId === 'new') {
      return this.handleNewCat(embedding, userId, rawGPS, photoUrl);
    }

    // Confirm match — treat as high-confidence match
    return this.handleMatch(catId, 1.0, embedding, userId, rawGPS, photoUrl);
  }

  /**
   * Handle a high-confidence match: record sighting + award XP.
   */
  private async handleMatch(
    catId: string,
    similarity: number,
    embedding: number[],
    userId: string,
    rawGPS: RawGPS,
    photoUrl?: string,
  ): Promise<OrchestrationResult> {
    const cat = await this.prisma.cat.findUniqueOrThrow({ where: { id: catId } });

    // Update cat embedding with latest scan for continuous improvement
    await this.vectorService.store(catId, embedding);

    // Record sighting
    // TODO: Replace with SightingService.appendSighting when implemented
    const { fuzzedLat, fuzzedLng } = fuzzCoordinates(rawGPS.lat, rawGPS.lng);
    await this.prisma.sighting.create({
      data: {
        catId,
        reporterId: userId,
        fuzzedLat: fuzzedLat ?? 0,
        fuzzedLng: fuzzedLng ?? 0,
        photoUrl: photoUrl ?? '',
        type: 'scan',
      },
    });

    // Update cat's last known location
    await this.prisma.cat.update({
      where: { id: catId },
      data: {
        lastKnownApproxLat: fuzzedLat ?? cat.lastKnownApproxLat,
        lastKnownApproxLng: fuzzedLng ?? cat.lastKnownApproxLng,
      },
    });

    // Mark the cat as discovered by this scanner (Lvl0) — Ownership XP can
    // only accrue against an existing UserCatDiscovery record (Req 14.3).
    await this.prisma.userCatDiscovery.upsert({
      where: { userId_catId: { userId, catId } },
      update: {},
      create: { userId, catId },
    });

    // Award re-sighting XP: 3 XP once per unique daily scan per cat (Req 6.2)
    const xpResult = await this.gamificationService.recordAction(userId, catId, 'scan');

    return {
      result: 'matched',
      cat: this.toCatDTO(cat),
      xpAwarded: xpResult.xpAwarded,
      levelUp: xpResult.levelUp,
    };
  }

  /**
   * Handle borderline similarity: return candidate cat for user confirmation.
   */
  private async handleConfirmNeeded(
    catId: string,
    embedding: number[],
    photoUrl: string,
  ): Promise<OrchestrationResult> {
    const cat = await this.prisma.cat.findUniqueOrThrow({ where: { id: catId } });

    return {
      result: 'confirm_needed',
      candidateCat: this.toCatDTO(cat),
      embedding,
      photoUrl,
    };
  }

  /**
   * Handle new cat: create Cat record, UserCatDiscovery, sighting, and award XP.
   */
  private async handleNewCat(
    embedding: number[],
    userId: string,
    rawGPS: RawGPS,
    photoUrl?: string,
  ): Promise<OrchestrationResult> {
    const { fuzzedLat, fuzzedLng } = fuzzCoordinates(rawGPS.lat, rawGPS.lng);

    // Create the new cat record
    const newCat = await this.prisma.cat.create({
      data: {
        firstDiscovererId: userId,
        lastKnownApproxLat: fuzzedLat ?? 0,
        lastKnownApproxLng: fuzzedLng ?? 0,
        photoUrl: photoUrl ?? null,
        embeddingRef: '',
      },
    });

    // Store embedding in pgvector
    await this.vectorService.store(newCat.id, embedding);

    // Create UserCatDiscovery record
    await this.prisma.userCatDiscovery.create({
      data: {
        userId,
        catId: newCat.id,
      },
    });

    // Record sighting
    // TODO: Replace with SightingService.appendSighting when implemented
    await this.prisma.sighting.create({
      data: {
        catId: newCat.id,
        reporterId: userId,
        fuzzedLat: fuzzedLat ?? 0,
        fuzzedLng: fuzzedLng ?? 0,
        photoUrl: photoUrl ?? '',
        type: 'scan',
      },
    });

    // Award discovery XP: 100 XP to global total and per-cat XP (Req 6.1)
    const xpResult = await this.gamificationService.recordAction(
      userId,
      newCat.id,
      'discover_new',
    );

    return {
      result: 'new_cat',
      cat: this.toCatDTO(newCat),
      xpAwarded: xpResult.xpAwarded,
    };
  }

  /**
   * Convert a Prisma Cat record to the shared Cat DTO.
   */
  private toCatDTO(cat: {
    id: string;
    name: string | null;
    embeddingRef: string;
    firstDiscovererId: string;
    lastKnownApproxLat: number;
    lastKnownApproxLng: number;
    photoUrl: string | null;
    registeredAt: Date;
  }): Cat {
    return {
      id: cat.id,
      name: cat.name ?? '',
      embeddingRef: cat.embeddingRef,
      firstDiscovererId: cat.firstDiscovererId,
      lastKnownApproxLat: cat.lastKnownApproxLat,
      lastKnownApproxLng: cat.lastKnownApproxLng,
      photoUrl: cat.photoUrl ?? '',
      registeredAt: cat.registeredAt,
    };
  }
}
