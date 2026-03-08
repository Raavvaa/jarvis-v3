FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Удаляем dev-зависимости
RUN npm prune --production

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
