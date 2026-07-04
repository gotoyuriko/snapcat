import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { gpsResponseGuard } from './middleware/gpsResponseGuard';

import { authRoutes } from './modules/auth/auth.routes';
import { recognitionRoutes } from './modules/recognition/recognition.routes';
import { catProfileRoutes } from './modules/cat-profile/cat-profile.routes';
import { sightingRoutes } from './modules/sighting/sighting.routes';
import { mapRoutes } from './modules/sighting/map.routes';
import { catpediaRoutes } from './modules/catpedia/catpedia.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { ChatGateway } from './modules/chat/chat.gateway';
import { staffVerificationRoutes } from './modules/staff-verification/staff-verification.routes';
import { medicalRoutes } from './modules/medical/medical.routes';
import { walletRoutes } from './modules/donation/wallet.routes';
import { foodItemRoutes } from './modules/donation/food-item.routes';
import { donationRoutes } from './modules/donation/donation.routes';
import { leaderboardRoutes } from './modules/leaderboard/leaderboard.routes';
import { gamificationRoutes } from './modules/gamification/gamification.routes';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

// Middleware
// Client fetches photos/API from a different origin (tunnel URL) than the
// app itself runs on, so relax CORP — helmet's default (same-origin) blocks
// cross-origin <img> loads (e.g. Catpedia thumbnails) silently.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());

// GPS Response Guard — strips raw GPS fields from all JSON responses (Req 5.5, 14.2)
app.use(gpsResponseGuard);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/recognition', recognitionRoutes);
app.use('/api/sighting', sightingRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/catpedia', catpediaRoutes);
app.use('/api/cats', chatRoutes);
app.use('/api/cats', leaderboardRoutes);
app.use('/api/cats', catProfileRoutes);
app.use('/api/staff', staffVerificationRoutes);
app.use('/api/medical-requests', medicalRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/food-items', foodItemRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/gamification', gamificationRoutes);

// Socket.io setup — Initialize chat gateway
const chatGateway = new ChatGateway(io);
chatGateway.initialize();

const PORT = config.port || 3000;

httpServer.listen(PORT, () => {
  console.log(`CodingKitty server running on port ${PORT}`);
});

export { app, io };
