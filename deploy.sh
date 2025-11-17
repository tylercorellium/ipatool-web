#!/bin/bash

# ipatool-web Docker Deployment Script
# This script helps you quickly deploy ipatool-web on a fresh VPS

set -e  # Exit on error

echo "=========================================="
echo "  ipatool-web Docker Deployment"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo ""
    echo "Would you like to install Docker now? (y/n)"
    read -r install_docker

    if [ "$install_docker" = "y" ]; then
        echo "📦 Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh

        # Add current user to docker group
        sudo usermod -aG docker $USER

        echo "✅ Docker installed successfully!"
        echo "⚠️  You may need to log out and back in for group changes to take effect."
        echo ""
    else
        echo "Please install Docker manually and run this script again."
        exit 1
    fi
fi

# Check if Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed."
    echo "Installing Docker Compose plugin..."

    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
    elif command -v yum &> /dev/null; then
        sudo yum install -y docker-compose-plugin
    else
        echo "Please install Docker Compose manually."
        exit 1
    fi
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if SSL certificates exist
if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
    echo "⚠️  SSL certificates not found"
    echo ""
    echo "SSL certificates are required for HTTPS."
    echo "Would you like to generate self-signed certificates? (y/n)"
    read -r generate_ssl

    if [ "$generate_ssl" = "y" ]; then
        echo "📜 Generating self-signed SSL certificates..."

        # Check if openssl is installed
        if ! command -v openssl &> /dev/null; then
            echo "❌ OpenSSL is not installed"
            echo "Installing OpenSSL..."

            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y openssl
            elif command -v yum &> /dev/null; then
                sudo yum install -y openssl
            else
                echo "Please install OpenSSL manually"
                exit 1
            fi
        fi

        # Use the automated SSL generation script
        if [ -f "./generate-ssl-auto.sh" ]; then
            ./generate-ssl-auto.sh localhost
        elif [ -f "./setup-ssl.sh" ]; then
            # Run in auto-generate mode (non-interactive)
            AUTO_GENERATE=true DOMAIN=localhost ./setup-ssl.sh
        else
            echo "❌ SSL generation scripts not found"
            echo "Please run manually: openssl req -x509 -newkey rsa:4096 -nodes -keyout ssl/key.pem -out ssl/cert.pem -days 365"
            exit 1
        fi

        # Verify certificates were created
        if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
            echo "✅ SSL certificates generated successfully"
        else
            echo "❌ Failed to generate SSL certificates"
            echo "Please check the error messages above"
            exit 1
        fi
        echo ""
    else
        echo "Please provide SSL certificates in the ssl/ directory:"
        echo "  - ssl/cert.pem"
        echo "  - ssl/key.pem"
        echo ""
        exit 1
    fi
else
    echo "✅ SSL certificates found"
    echo ""
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."

    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env file created"
        echo ""
        echo "📝 You may want to edit .env to customize:"
        echo "   - PUBLIC_HOSTNAME (for OTA installation)"
        echo "   - BACKEND_PORT / FRONTEND_PORT (if needed)"
        echo ""
    fi
fi

# Pull/build images
echo "🏗️  Building Docker images..."
echo "This may take several minutes on first run..."
echo ""

docker compose build

echo ""
echo "✅ Build complete!"
echo ""

# Start services
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Access your application at:"
echo "   Backend:  https://localhost:443"
echo "   Frontend: https://localhost:8443"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker compose logs -f"
echo "   Stop services:    docker compose stop"
echo "   Start services:   docker compose start"
echo "   Restart:          docker compose restart"
echo "   Update:           git pull && docker compose up -d --build"
echo ""
echo "⚠️  Note: Self-signed certificates will show security warnings."
echo "   For production, use Let's Encrypt certificates."
echo ""
echo "📖 For more information, see DOCKER-DEPLOY.md"
echo "=========================================="
