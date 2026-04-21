FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Accept build arguments for API URL configuration
# Leave empty to use auto-discovery from window.location
ARG REACT_APP_API_URL

# Set as environment variables for the build
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Build the application for production
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port (SSL terminated at nginx reverse proxy)
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
