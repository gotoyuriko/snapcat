/**
 * Chat Module
 * Real-time messaging for cat community chats using Socket.io.
 */

export { ChatService, ForbiddenError } from './chat.service';
export type { ChatMessageRecord } from './chat.service';
export { ChatController } from './chat.controller';
export { ChatGateway } from './chat.gateway';
export { chatRoutes } from './chat.routes';
