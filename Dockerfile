FROM node:22-alpine

WORKDIR /app

# Required for native modules (better-sqlite3, etc.)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Placeholder — real DATABASE_URL is injected at runtime via docker-compose
ENV DATABASE_URL=postgresql://build-placeholder/placeholder

RUN npx prisma generate --schema=prisma/schema.prisma

EXPOSE 4002

CMD ["npm", "run", "start:railway"]
