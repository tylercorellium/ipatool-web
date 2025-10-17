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
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "🚀 Starting backend server..."
cd "$SCRIPT_DIR/backend"
npm start > backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo "   Backend URL: http://localhost:3001"
echo "   Backend logs: $SCRIPT_DIR/backend/backend.log"
echo ""

# Wait a moment for backend to start
sleep 2

# Check if backend is still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ ERROR: Backend failed to start. Check backend.log for details."
    tail -20 backend.log
    exit 1
fi

# Start frontend
echo "🚀 Starting frontend server..."
cd "$SCRIPT_DIR/ipatool-frontend"
npm start > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo "   Frontend URL: http://localhost:3000"
echo "   Frontend logs: $SCRIPT_DIR/ipatool-frontend/frontend.log"
echo ""

echo "=========================================="
echo "✅ Both servers are running!"
echo "=========================================="
echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo ""
echo "📋 To view logs in real-time:"
echo "   Backend:  tail -f $SCRIPT_DIR/backend/backend.log"
echo "   Frontend: tail -f $SCRIPT_DIR/ipatool-frontend/frontend.log"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user to stop
wait $BACKEND_PID $FRONTEND_PID
