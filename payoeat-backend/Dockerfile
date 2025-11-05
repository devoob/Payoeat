# Use Node 24.1.0 base image
FROM node:24.1.0

# Set working directory in container
WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all other files (server.js, folders, etc.)
COPY . .

# Expose backend port (adjust if needed)
EXPOSE 3001

# Start the app
CMD ["node", "server.js"]