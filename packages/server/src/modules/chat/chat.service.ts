import { ChatMessage } from '@codingkitty/shared';

/**
 * TODO: Implement ChatService
 * - Persist messages to database
 * - Retrieve message history with pagination
 * - Emit real-time events via Socket.io
 */

export class ChatService {
  async sendMessage(_catId: string, _senderId: string, _content: string): Promise<ChatMessage> {
    // TODO: Create message, emit via socket
    throw new Error('Not implemented');
  }

  async getMessages(_catId: string, _limit: number = 50, _before?: Date): Promise<ChatMessage[]> {
    // TODO: Query messages with cursor-based pagination
    throw new Error('Not implemented');
  }
}
