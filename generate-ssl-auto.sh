#!/bin/bash

# Non-interactive SSL certificate generation for automated deployments
# Usage: ./generate-ssl-auto.sh [domain]

set -e

echo "=========================================="
echo "  Auto SSL Certificate Generation"
echo "=========================================="
echo ""

# Get domain from argument or use localhost
DOMAIN="${1:-localhost}"

# Create ssl directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/ssl"
mkdir -p "$SSL_DIR"

echo "📁 SSL directory: $SSL_DIR"
echo "🌐 Domain: $DOMAIN"
echo ""

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "✅ SSL certificates already exist - skipping generation"
    echo ""
    exit 0
fi

# Get server IP address
echo "🔍 Detecting server IP address..."

# Try multiple methods to get IP address (cross-platform)
if command -v hostname &> /dev/null && hostname -I &> /dev/null 2>&1; then
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
elif command -v ip &> /dev/null; then
    SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -n1)
elif command -v ifconfig &> /dev/null; then
    SERVER_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -n1 | cut -d':' -f2)
else
    SERVER_IP="127.0.0.1"
fi

# Fallback to localhost if no IP found
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
fi

echo "   Detected IP: $SERVER_IP"
echo ""

# Generate certificate
echo "🔐 Generating self-signed SSL certificate..."

openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=ipatool-web/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,DNS:ipatool-web,IP:$SERVER_IP,IP:127.0.0.1" \
    2>/dev/null || {
    # Fallback without -addext for older OpenSSL versions
    echo "⚠️  Using fallback method for older OpenSSL..."
    openssl req -x509 -newkey rsa:4096 -nodes \
        -keyout "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -days 365 \
        -subj "/C=US/ST=State/L=City/O=ipatool-web/CN=$DOMAIN" \
        2>/dev/null
}

# Set permissions
chmod 644 "$SSL_DIR/cert.pem"
chmod 600 "$SSL_DIR/key.pem"

echo "✅ SSL certificate generated successfully!"
echo ""
echo "📄 Certificate: $SSL_DIR/cert.pem"
echo "🔑 Private key: $SSL_DIR/key.pem"
echo ""

# Display certificate info
echo "📋 Certificate information:"
openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject -dates 2>/dev/null || true
echo ""

echo "=========================================="
echo "✅ SSL setup complete!"
echo "=========================================="
echo ""
echo "⚠️  Note: Self-signed certificates will show security warnings."
echo "   For production, use Let's Encrypt:"
echo "   certbot certonly --standalone -d $DOMAIN"
echo ""
