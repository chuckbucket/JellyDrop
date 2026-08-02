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

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./public

ENV PORT=8080
EXPOSE 8080
CMD ["node", "backend/dist/backend/src/index.js"]
