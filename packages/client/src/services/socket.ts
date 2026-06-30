import { io, Socket } from 'socket.io-client';

/**
 * TODO: Implement Socket.io client
 * - Connect to server with JWT authentication
 * - Handle reconnection and error events
 * - Provide methods for joining/leaving chat rooms
 * - Emit and listen for real-time events
 */

const SOCKET_URL = 'http://172.19.66.228:3000';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
