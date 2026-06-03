# Stage 1: Build Image
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./

# Install build tools, then install packages
RUN apk add --no-cache python3 make g++
RUN npm install --omit=dev

# Stage 2: Final Production Image
FROM node:20-alpine

WORKDIR /app

# Copy the built node_modules over from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]