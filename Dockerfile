# Stage 1: Build client
FROM node:20-slim AS builder
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

# Install Playwright Chromium dependencies for Google Maps scraper
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libwayland-client0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright and its browser
RUN npx playwright install chromium

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built client
COPY --from=builder /app/client/dist ./server/public/

# Create data directory for persistent storage
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server/index.js"]
