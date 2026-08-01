FROM node:18

WORKDIR /app

# pura project copy karo
COPY . .

# backend folder me jao
WORKDIR /app/backend

# install dependencies
RUN npm install

# port expose
EXPOSE 5000

# start app
CMD ["npm", "start"]