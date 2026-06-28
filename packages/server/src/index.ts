import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';

import { authRoutes } from './modules/auth/auth.routes';
import { recognitionRoutes } from './modules/recognition/recognition.routes';
import { sightingRoutes } from './modules/sighting/sighting.routes';
import { mapRoutes } from './modules/sighting/map.routes';
import { catpediaRoutes } from './modules/catpedia/catpedia.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { ChatGateway } from './modules/chat/chat.gateway';
import { staffVerificationRoutes } from './modules/staff-verification/staff-verification.routes';
// TODO: Import remaining route modules
// import { gamificationRoutes } from './modules/gamification/gamification.routes';
// import { donationRoutes } from './modules/donation/donation.routes';
// import { medicalRoutes } from './modules/medical/medical.routes';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

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
app.use('/api/staff', staffVerificationRoutes);
// TODO: Mount remaining routes
// app.use('/api/gamification', gamificationRoutes);
// app.use('/api/donation', donationRoutes);
// app.use('/api/medical', medicalRoutes);

// Socket.io setup — Initialize chat gateway
const chatGateway = new ChatGateway(io);
chatGateway.initialize();

const PORT = config.port || 3000;

httpServer.listen(PORT, () => {
  console.log(`CodingKitty server running on port ${PORT}`);
});

export { app, io };
