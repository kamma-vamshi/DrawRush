FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Need devDependencies to run build (like typescript)
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────────────────

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S drawrush -u 1001 -G nodejs
USER drawrush

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health | grep -q '"status":"ok"'

CMD ["node", "dist/index.js"]
