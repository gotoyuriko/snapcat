import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { ChatService } from './chat.service';

interface SocketUser {
  userId: string;
  email: string;
}

/**
 * Chat Gateway — Socket.io handler for real-time cat community chat.
 * Task 9.1: WebSocket channel per cat, gated by Lvl1+ ownership check.
 *
 * Requirements:
 * - 8.1: Lvl1+ owners can read/send messages
 * - 8.2: Non-owners get 403 rejection
 * - 8.3: Persist first, then broadcast
 */
export class ChatGateway {
  private chatService: ChatService;

  constructor(private io: SocketIOServer) {
    this.chatService = new ChatService();
  }

  /** Initialize Socket.io event handlers */
  initialize(): void {
    // Authenticate on connection using JWT from handshake
    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret, {
          clockTolerance: 0,
        }) as jwt.JwtPayload & SocketUser;

        (socket as Socket & { user: SocketUser }).data = {
          userId: decoded.userId,
          email: decoded.email,
        };
        next();
      } catch {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = socket.data as SocketUser;
      console.log(`Client connected: ${socket.id} (user: ${user.userId})`);

      socket.on('join_room', async (catId: string) => {
        try {
          const isOwner = await this.chatService.isLvl1Owner(user.userId, catId);
          if (!isOwner) {
            socket.emit('error', { code: 403, message: 'Not a Lvl1+ owner of this cat' });
            return;
          }

          const room = `cat:${catId}`;
          await socket.join(room);
          socket.emit('joined_room', { catId, room });
        } catch (err) {
          socket.emit('error', { code: 500, message: 'Failed to join room' });
        }
      });

      socket.on('leave_room', (catId: string) => {
        const room = `cat:${catId}`;
        socket.leave(room);
        socket.emit('left_room', { catId, room });
      });

      socket.on('send_message', async (data: { catId: string; content: string }) => {
        try {
          // Req 8.3: persist FIRST via ChatService (which also checks ownership)
          const message = await this.chatService.sendMessage(
            data.catId,
            user.userId,
            data.content,
          );

          // Only after successful persistence, broadcast to room
          const room = `cat:${data.catId}`;
          this.io.to(room).emit('new_message', message);
        } catch (err: any) {
          if (err?.statusCode === 403) {
            socket.emit('error', { code: 403, message: err.message });
          } else {
            socket.emit('error', { code: 500, message: 'Failed to send message' });
          }
        }
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }
}
