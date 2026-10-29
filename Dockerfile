# ---------------------------------------------------------------------------
# Lexalys Labs Client Portal - production image (Assignment 2, Part I)
# Build:  docker build -t farazanjamali/lexalys-portal:latest .
# ---------------------------------------------------------------------------
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# 1. Install dependencies first so this layer is cached between code changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 2. Copy the application code (see .dockerignore for what is left out)
COPY --chown=node:node . .

# 3. Run as the unprivileged "node" user, not root
USER node

EXPOSE 3000

# Docker marks the container "healthy" only when the app can reach MySQL
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

CMD ["node", "src/server.js"]
