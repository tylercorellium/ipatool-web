FROM node:20-alpine

# Install dependencies for building ipatool
RUN apk add --no-cache \
    go \
    git \
    musl-dev

# Build and install ipatool from source
# Pinned to v2.3.0 — master after 2026-04-14 has a context-key regression
# (cmd/auth.go reads "interactive" with a plain string key while root.go
# writes it with a typed key, causing a nil-interface panic on login).
ARG IPATOOL_VERSION=v2.3.0
RUN git clone --depth 1 --branch ${IPATOOL_VERSION} https://github.com/majd/ipatool.git /tmp/ipatool && \
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

# Expose HTTP port (SSL terminated at nginx reverse proxy)
EXPOSE 3001

# Start the backend server
CMD ["node", "index.js"]
