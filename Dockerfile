FROM node:18

WORKDIR /app

COPY . .

WORKDIR /app/backend

RUN npm install

# CRITICAL: preload the task compatibility router for EVERY Node process.
# This protects the API even if Railway uses a custom/legacy start command
# such as `node server.js` instead of the repository start command.
ENV NODE_OPTIONS="--require ./routeCompatPreload.js"

EXPOSE 5000

# Deterministic backend boot.
CMD ["node", "boot.js"]
