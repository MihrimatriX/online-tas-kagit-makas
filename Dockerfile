# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

# Same-origin socket in the single-container image
ENV VITE_SOCKET_URL=
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    SERVE_FRONTEND=1 \
    DATA_FILE=/data/store.json \
    FRONTEND_ORIGIN=*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist

RUN mkdir -p /data \
  && addgroup -S tmk \
  && adduser -S tmk -G tmk \
  && chown -R tmk:tmk /app /data

USER tmk
EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health >/dev/null || exit 1

CMD ["npm", "run", "start", "-w", "backend"]
