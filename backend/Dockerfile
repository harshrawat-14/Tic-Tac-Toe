# ── Stage 1: Build the TypeScript bundle ────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cache friendly)
COPY package.json ./
RUN npm install --frozen-lockfile

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Nakama runtime with bundled module ──────────────────────────────
FROM heroiclabs/nakama:3.21.1

# Copy the compiled single-file bundle into Nakama's module directory.
# Nakama will load any .js file found in /nakama/data/modules/ on startup.
COPY --from=builder /app/build/index.js /nakama/data/modules/index.js

# Ports:
#   7349 — client port (WebSocket / real-time)
#   7350 — HTTP API
#   7351 — gRPC
EXPOSE 7349 7350 7351
