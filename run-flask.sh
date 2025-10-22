#!/bin/bash

# ipatool-web Flask startup script
# Runs the unified Flask application on port 443

set -e

echo "=========================================="
echo "  ipatool-web Flask Server"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ ERROR: Python 3 is not installed"
    echo "   Please install Python 3.8 or higher"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "✅ Python found: $PYTHON_VERSION"
echo ""

# Check if ipatool is installed
echo "🔍 Checking for ipatool..."
if ! command -v ipatool &> /dev/null; then
    echo "❌ ERROR: ipatool is not installed or not in PATH"
    echo "   Please install ipatool first:"
    echo "   - Build from source and copy to /usr/local/bin/"
    echo "   - Or install via: brew install ipatool"
    exit 1
fi

IPATOOL_VERSION=$(ipatool --version 2>&1 || echo "unknown")
echo "✅ ipatool found: $IPATOOL_VERSION"
echo ""

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment"
        echo "   Try: sudo apt install python3-venv"
        exit 1
    fi
    echo ""
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
else
    echo "❌ Virtual environment activation script not found"
    exit 1
fi
echo ""

# Install/update dependencies
echo "📦 Installing Python dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo ""

# Check if SSL certificates exist
SSL_DIR="$SCRIPT_DIR/ssl"
if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo "⚠️  SSL certificates not found!"
    echo "   Run './setup-ssl.sh' to generate certificates"
    echo ""
    read -p "Continue without SSL? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build frontend if build directory doesn't exist
if [ ! -d "ipatool-frontend/build" ]; then
    echo "⚠️  Frontend build not found!"
    echo "   Building React frontend..."
    cd ipatool-frontend
    npm install
    npm run build
    cd ..
    echo ""
fi

# Get port from environment or use default
PORT="${PORT:-443}"

echo "=========================================="
echo "🚀 Starting Flask Server"
echo "=========================================="
echo ""
echo "Server will start on port: $PORT"
echo ""

if [ "$PORT" -lt 1024 ]; then
    echo "⚠️  Port $PORT requires root privileges"
    echo "   Running with sudo..."
    echo ""
    # Use the virtual environment's Python with sudo
    sudo PORT=$PORT "$(which python3)" app.py
else
    python3 app.py
fi
