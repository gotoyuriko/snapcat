import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * TODO: Implement Chat Gateway (Socket.io handler)
 * - Handle 'join_room' event (user joins a cat's chat room)
 * - Handle 'leave_room' event
 * - Handle 'send_message' event (persist + broadcast to room)
 * - Authenticate socket connections via JWT
 */

export class ChatGateway {
  constructor(private io: SocketIOServer) {}

  /** Initialize Socket.io event handlers */
  initialize(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('join_room', (_catId: string) => {
        // TODO: Verify user has access, join room
      });

      socket.on('leave_room', (_catId: string) => {
        // TODO: Leave room
      });

      socket.on('send_message', (_data: { catId: string; content: string }) => {
        // TODO: Authenticate, persist message, broadcast to room
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }
}
