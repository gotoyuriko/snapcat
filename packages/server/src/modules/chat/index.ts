import { ChatMessage } from '@codingkitty/shared';

/**
 * Chat Module
 * Real-time messaging for cat community chats using Socket.io.
 */

export interface ChatModule {
  /** Send a message in a cat's chat room */
  sendMessage(catId: string, senderId: string, content: string): Promise<ChatMessage>;
  /** Get message history for a cat's chat */
  getMessages(catId: string, limit?: number, before?: Date): Promise<ChatMessage[]>;
}

export { ChatService } from './chat.service';
export { ChatController } from './chat.controller';
export { chatRoutes } from './chat.routes';
