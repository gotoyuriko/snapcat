import { UUID } from './user';

/** Represents a chat message in a cat's community chat */
export interface ChatMessage {
  id: UUID;
  catId: UUID;
  senderId: UUID;
  content: string;
  createdAt: Date;
}
