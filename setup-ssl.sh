#!/bin/bash

# Script to generate self-signed SSL certificates for ipatool-web

set -e

echo "=========================================="
echo "  SSL Certificate Setup"
echo "=========================================="
echo ""

# Create ssl directory if it doesn't exist
SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ssl"
mkdir -p "$SSL_DIR"

echo "📁 SSL directory: $SSL_DIR"
echo ""

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "⚠️  SSL certificates already exist!"
    echo ""
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificates."
        exit 0
    fi
    echo "Regenerating certificates..."
    echo ""
fi

# Get server IP address
echo "🔍 Detecting server IP address..."
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "   Detected IP: $SERVER_IP"
echo ""

# Prompt for custom domain (optional)
read -p "Enter domain name (or press Enter to use IP address): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN="$SERVER_IP"
fi

echo ""
echo "🔐 Generating self-signed SSL certificate for: $DOMAIN"
echo ""

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -days 365 \
    -subj "/C=US/ST=State/L=City/O=ipatool-web/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:$SERVER_IP,IP:127.0.0.1" \
    2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ SSL certificate generated successfully!"
    echo ""
    echo "📄 Certificate: $SSL_DIR/cert.pem"
    echo "🔑 Private key: $SSL_DIR/key.pem"
    echo ""

    # Set appropriate permissions
    chmod 644 "$SSL_DIR/cert.pem"
    chmod 600 "$SSL_DIR/key.pem"

    echo "🔒 File permissions set correctly"
    echo ""

    # Display certificate info
    echo "📋 Certificate information:"
    openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject -dates
    echo ""

    echo "=========================================="
    echo "✅ SSL setup complete!"
    echo "=========================================="
    echo ""
    echo "⚠️  IMPORTANT: Self-signed certificates will show security warnings"
    echo "   in browsers and iOS devices. You need to:"
    echo ""
    echo "   1. On iOS device:"
    echo "      - Download the certificate from: https://$DOMAIN:3001/ssl/cert.pem"
    echo "      - Go to Settings > General > VPN & Device Management"
    echo "      - Install the certificate profile"
    echo "      - Go to Settings > General > About > Certificate Trust Settings"
    echo "      - Enable full trust for the certificate"
    echo ""
    echo "   2. On Desktop browser:"
    echo "      - Accept the security warning when accessing the site"
    echo "      - Or import the certificate to your system trust store"
    echo ""
    echo "   3. For production, use Let's Encrypt for a valid certificate:"
    echo "      certbot certonly --standalone -d yourdomain.com"
    echo ""
else
    echo "❌ Failed to generate SSL certificate"
    exit 1
fi
