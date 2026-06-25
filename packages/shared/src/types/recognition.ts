import { UUID } from './user';

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

/** Discriminated union for cat recognition results */
export type RecognitionResult = RecognitionMatch | RecognitionNewCat | RecognitionNoCat;
