FROM node:18

WORKDIR /app
COPY . .

WORKDIR /app/backend
RUN npm install

EXPOSE 5000

# Use the same deterministic entrypoint as npm start/Railway.
# Task compatibility routes are mounted directly by server.js.
CMD ["node", "server.js"]
