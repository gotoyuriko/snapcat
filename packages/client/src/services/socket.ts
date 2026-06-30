import { io, Socket } from 'socket.io-client';

/**
 * TODO: Implement Socket.io client
 * - Connect to server with JWT authentication
 * - Handle reconnection and error events
 * - Provide methods for joining/leaving chat rooms
 * - Emit and listen for real-time events
 */

// Same host as the REST API (the backend's Cloudflare tunnel URL set by
// start-tunnel.sh via EXPO_PUBLIC_API_URL), falling back to localhost.
const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
