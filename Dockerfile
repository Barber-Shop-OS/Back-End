FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Só dependências de produção, a partir do lockfile.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Não roda como root.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
