import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';

import { authRoutes } from './modules/auth/auth.routes';
import { recognitionRoutes } from './modules/recognition/recognition.routes';
// TODO: Import remaining route modules
// import { sightingRoutes } from './modules/sighting/sighting.routes';
// import { gamificationRoutes } from './modules/gamification/gamification.routes';
// import { donationRoutes } from './modules/donation/donation.routes';
// import { medicalRoutes } from './modules/medical/medical.routes';
// import { chatRoutes } from './modules/chat/chat.routes';
// import { staffVerificationRoutes } from './modules/staff-verification/staff-verification.routes';
// import { catpediaRoutes } from './modules/catpedia/catpedia.routes';

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
// TODO: Mount remaining routes
// app.use('/api/sighting', sightingRoutes);
// app.use('/api/gamification', gamificationRoutes);
// app.use('/api/donation', donationRoutes);
// app.use('/api/medical', medicalRoutes);
// app.use('/api/chat', chatRoutes);
// app.use('/api/staff-verification', staffVerificationRoutes);
// app.use('/api/catpedia', catpediaRoutes);

// Socket.io setup
// TODO: Initialize chat gateway with io instance

const PORT = config.port || 3000;

httpServer.listen(PORT, () => {
  console.log(`CodingKitty server running on port ${PORT}`);
});

export { app, io };
