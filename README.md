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
- **AI/ML:** YOLOX (cat detection), MegaDescriptor (re-identification), pgvector (embedding search)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for Postgres/PostGIS/pgvector, Temporal, and MinIO)
- The [Expo Go](https://expo.dev/go) app on your phone, on the **same Wi-Fi network** as your computer

### 1. Install & configure

```bash
npm install
cp packages/server/.env.example packages/server/.env
```

### 2. Start backing services and set up the database

```bash
docker compose up -d

cd packages/server
npx prisma migrate deploy   # applies all migrations to the fresh DB
npm run prisma:seed         # base data: food items + certified partners
```

### 3. Run the app

In three separate terminals, from the repo root:

```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — Temporal worker (required for the care-request workflow)
npm run worker --workspace @codingkitty/server

# Terminal 3 — Mobile app, pointed at your computer's LAN IP so a physical
# phone on the same Wi-Fi can reach the API (find your IP with `ipconfig`
# on Windows or `ifconfig`/`ip a` on Mac/Linux)
cd packages/client
EXPO_PUBLIC_API_URL=http://<YOUR-LAN-IP>:3000 npx expo start
```

Scan the QR code Expo prints with the Expo Go app. If your phone can't reach your computer's LAN IP (e.g. campus Wi-Fi that isolates devices, or judging over separate networks), use one of the tunnel scripts in `packages/client` (`start-tunnel.sh` / `start-tunnel.ps1`) instead — they require [`cloudflared`](https://github.com/cloudflare/cloudflared/releases) installed and generate a public URL that works over the internet.

### 4. Populate demo data (optional)

Register an account in the app first, then see **[docs/DEMO-GUIDE.md](docs/DEMO-GUIDE.md)** to seed a full showcase dataset (cats at every level, care requests at every lifecycle stage, community chat, donation history) for that account.

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
