# CodingKitty Example

A community-driven platform for discovering, tracking, and caring for stray cats. Users can identify cats via AI-powered image recognition, track sightings on a map, donate food, request veterinary care, and chat with other caretakers.

## Architecture

Monorepo with three packages:

| Package           | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `packages/shared` | TypeScript types and interfaces shared across client and server          |
| `packages/server` | Node.js + Express API with Prisma ORM, Temporal workflows, and Socket.io |
| `packages/client` | React Native mobile app with maps, AR feeding, and real-time chat        |

## Tech Stack

- **Language:** TypeScript
- **Server:** Express, Prisma (PostgreSQL + PostGIS + pgvector), Temporal, Socket.io
- **Client:** React Native (Expo), react-native-maps
- **Testing:** Jest + fast-check (property-based testing)
- **AI/ML:** YOLOv8 (cat detection), MegaDescriptor (re-identification), pgvector (embedding search)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp packages/server/.env.example packages/server/.env

# Generate Prisma client
npm run prisma:generate --workspace=packages/server

# Run development server
npm run dev --workspace=packages/server

# Run mobile app
npm run start --workspace=packages/client
```

## Project Structure

```
codingkitty/
├── packages/
│   ├── shared/          # Shared types & interfaces
│   ├── server/          # API server
│   │   ├── prisma/      # Database schema & migrations
│   │   ├── src/
│   │   │   ├── modules/ # Feature modules (auth, recognition, sighting, etc.)
│   │   │   ├── workflows/ # Temporal workflow definitions
│   │   │   ├── middleware/
│   │   │   └── config/
│   │   └── ...
│   └── client/          # React Native app
│       └── src/
│           ├── screens/
│           ├── navigation/
│           ├── services/
│           ├── hooks/
│           ├── components/
│           └── store/
├── package.json         # Workspace root
└── tsconfig.base.json   # Shared TS config
```

## License

Private — All rights reserved.
