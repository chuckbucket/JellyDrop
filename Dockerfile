# syntax=docker/dockerfile:1

# ---- build: compiles the frontend (Vite) and backend (tsc) ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

# ---- runtime: backend + its production deps + the built frontend as static files ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace=backend

COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/frontend/dist ./public

# node:20-alpine ships a built-in, unprivileged "node" user (uid 1000) — run as that instead of root.
RUN chown -R node:node /app
USER node

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:$PORT/healthz" || exit 1
CMD ["node", "backend/dist/backend/src/index.js"]
