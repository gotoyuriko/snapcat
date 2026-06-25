/**
 * TODO: Implement MegaDescriptor client
 * - Communicate with MegaDescriptor re-identification model service
 * - Send cropped cat image, receive embedding vector (512 or 768 dimensions)
 * - Used for cat re-identification across sightings
 */

export class MegaDescriptorClient {
  async getEmbedding(_croppedImageBuffer: Buffer): Promise<number[]> {
    // TODO: Call MegaDescriptor inference service
    throw new Error('Not implemented');
  }
}
