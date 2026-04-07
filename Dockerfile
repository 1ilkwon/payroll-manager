FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./

# SQLite DB 파일 저장 경로
RUN mkdir -p /data
ENV DATABASE_URL="file:/data/payroll.db"

EXPOSE 3000
CMD npx prisma db push --skip-generate && node_modules/.bin/next start -p 3000
