FROM node:20-alpine

# Install dependencies for building ipatool
RUN apk add --no-cache \
    go \
    git \
    musl-dev

# Build and install ipatool from source
RUN git clone https://github.com/majd/ipatool.git /tmp/ipatool && \
    cd /tmp/ipatool && \
    go build -o ipatool main.go && \
    mv ipatool /usr/local/bin/ && \
    chmod +x /usr/local/bin/ipatool && \
    rm -rf /tmp/ipatool

# Verify ipatool installation
RUN ipatool --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (production only, no devDependencies)
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directory for SSL certificates (optional)
RUN mkdir -p /app/ssl

# Expose default backend port
EXPOSE 443
EXPOSE 4000

# Start the backend server (use node directly for production, not nodemon)
CMD ["node", "index.js"]
