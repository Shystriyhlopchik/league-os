# Этап 1 — установка всех зависимостей и сборка приложения
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


# Этап 2 — production-образ с минимальным набором зависимостей
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN npm install -g pm2

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ecosystem.config.js ./ecosystem.config.js

EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
