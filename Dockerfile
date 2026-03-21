FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8080

CMD ["npm", "run", "start"]
