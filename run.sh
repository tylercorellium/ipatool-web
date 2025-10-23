#!/bin/bash

# ipatool-web startup script
# This script pulls the latest changes and starts both backend and frontend

set -e  # Exit on error

echo "=========================================="
echo "  ipatool-web Startup Script"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull origin main
echo ""

# Install/update backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
echo ""

# Install/update frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../ipatool-frontend
npm install
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

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # Kill any child processes
    pkill -P $$ 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Detect configured ports from environment or use defaults
BACKEND_PORT="${BACKEND_PORT:-443}"
FRONTEND_PORT="${FRONTEND_PORT:-8443}"

echo "=========================================="
echo "🚀 Starting servers..."
echo "=========================================="
echo ""
echo "Backend will start on:  https://localhost:$BACKEND_PORT"
echo "Frontend will start on: https://localhost:$FRONTEND_PORT"
echo ""
echo "📝 Note: If you need custom ports, set these before running:"
echo "   export BACKEND_PORT=<port>  # For backend (default: 443)"
echo "   export FRONTEND_PORT=<port> # For frontend (default: 8443)"
echo ""
echo "⚠️  Note: Port 443 requires sudo/root privileges"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""
echo "=========================================="
echo ""

# Start backend in background but show output with prefix
cd "$SCRIPT_DIR/backend"
(BACKEND_PORT=$BACKEND_PORT npm start 2>&1 | sed 's/^/[BACKEND] /') &
BACKEND_PID=$!

# Give backend a moment to start
sleep 3

# Start frontend in background but show output with prefix
cd "$SCRIPT_DIR/ipatool-frontend"
(PORT=$FRONTEND_PORT npm start 2>&1 | sed 's/^/[FRONTEND] /') &
FRONTEND_PID=$!

# Wait for either process to exit
wait -n

# If one exits, kill the other
cleanup
