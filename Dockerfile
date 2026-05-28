# ─────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# نصب OpenSSL
RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./

RUN npm ci

COPY . .

# Prisma generate
RUN npx prisma generate

# Build Typescript
RUN npm run build


# ─────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]