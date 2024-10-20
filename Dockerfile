# Use the official Node.js image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Build the TypeScript files
RUN npx tsc

# Expose the port for the http-server (default: 8080)
EXPOSE 9090
EXPOSE 8080

# Start the concurrently command
CMD ["npx", "concurrently", "\"http-server\"", "\"wait-on dist/index.js && node --watch dist/index.js\""]
