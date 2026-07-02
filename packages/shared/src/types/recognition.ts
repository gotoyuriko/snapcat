import { UUID } from './user';
import { Cat } from './cat';

/** Successful cat recognition result */
export interface RecognitionMatch {
  kind: 'match';
  catId: UUID;
  confidence: number;
  embeddingDistance: number;
}

/** Cat detected but not recognized (new cat) */
export interface RecognitionNewCat {
  kind: 'new_cat';
  embedding: number[];
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** No cat detected in the image */
export interface RecognitionNoCat {
  kind: 'no_cat';
}

/** Discriminated union for cat recognition results (simple pipeline result) */
export type RecognitionResult = RecognitionMatch | RecognitionNewCat | RecognitionNoCat;

// --- Orchestrator-level results (used by recognizeCat / confirmMatch) ---

/** No cat detected in the photo */
export interface OrchestrationNoCat {
  result: 'no_cat';
}

/** High-confidence match — cat identified, sighting recorded, XP awarded */
export interface OrchestrationMatched {
  result: 'matched';
  cat: Cat;
  xpAwarded: number;
  levelUp: boolean;
}

/** Borderline similarity — user must confirm the match */
export interface OrchestrationConfirmNeeded {
  result: 'confirm_needed';
  candidateCat: Cat;
  embedding: number[];
  photoUrl: string;
}

/** New cat registered — sighting recorded, XP awarded */
export interface OrchestrationNewCat {
  result: 'new_cat';
  cat: Cat;
  xpAwarded: number;
}

/** Discriminated union for the full orchestration result */
export type OrchestrationResult =
  | OrchestrationNoCat
  | OrchestrationMatched
  | OrchestrationConfirmNeeded
  | OrchestrationNewCat;
