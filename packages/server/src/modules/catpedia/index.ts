/**
 * Catpedia Module
 * Encyclopedia-style cat breed and care information.
 * Serves educational content about cat breeds, health tips, and care guides.
 */

export interface CatpediaEntry {
  id: string;
  breed: string;
  description: string;
  characteristics: string[];
  careGuide: string;
  imageUrl: string;
}

export { CatpediaController } from './catpedia.controller';
export { catpediaRoutes } from './catpedia.routes';
