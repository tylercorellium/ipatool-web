FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Accept build arguments
ARG REACT_APP_BACKEND_HOST=localhost
ARG REACT_APP_BACKEND_PORT=443
ARG REACT_APP_API_URL

# Set as environment variables for the build
ENV REACT_APP_BACKEND_HOST=${REACT_APP_BACKEND_HOST}
ENV REACT_APP_BACKEND_PORT=${REACT_APP_BACKEND_PORT}
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Build the application for production
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create directory for SSL certificates
RUN mkdir -p /etc/nginx/ssl

# Expose port 8443 (HTTPS) and 80 (HTTP)
EXPOSE 8443
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
