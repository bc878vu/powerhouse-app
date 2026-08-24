FROM node:18

WORKDIR /app

COPY . .

WORKDIR /app/backend

RUN npm install

EXPOSE 5000

# Bypass any cached/old npm start configuration and boot the
# deterministic task-compatible server directly.
CMD ["node", "boot.js"]
