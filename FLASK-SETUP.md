# Flask Setup Guide

This is the unified Flask application that serves both the API backend and React frontend on a single port.

## Quick Start

### 1. First-Time Setup

```bash
# Generate SSL certificates (if not already done)
./setup-ssl.sh

# Build the React frontend
cd ipatool-frontend
npm install
npm run build
cd ..

# Install Python dependencies (will be done automatically by run-flask.sh)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Run the Flask Server

**On port 443 (requires sudo):**
```bash
./run-flask.sh
```

**On a different port:**
```bash
PORT=8443 ./run-flask.sh
```

**Or run directly:**
```bash
# Activate virtual environment
source venv/bin/activate

# Run on port 443 (requires sudo)
sudo python3 app.py

# Or on a custom port
PORT=8443 python3 app.py
```

## What Changed?

### Before (Node.js)
- **Backend**: Node.js/Express on port 3001
- **Frontend**: React dev server on port 3000
- **Problem**: Two separate services, need nginx or port forwarding to use port 443

### After (Flask)
- **Unified Server**: Single Flask app on port 443
- **Backend API**: `/api/*` routes
- **Frontend**: Static React build served from `/`
- **Benefit**: One service, one port, simpler deployment

## Architecture

```
Flask App (port 443)
├── /                          → React frontend (static files)
├── /api/auth/login           → Authentication
├── /api/search               → App search
├── /api/download             → Download IPA
├── /api/manifest/:bundleId   → OTA manifest
├── /api/download-file/:file  → Serve IPA files
└── /ssl/cert.pem             → SSL certificate download
```

## How It Works

1. **app.py**: Main Flask application
   - Serves React build as static files
   - Provides all API endpoints
   - Handles ipatool command execution
   - Supports HTTPS with SSL certificates

2. **Frontend Build**: React app compiled to static HTML/JS/CSS
   - Built with `npm run build` in `ipatool-frontend/`
   - Served by Flask from `ipatool-frontend/build/`

3. **SSL**: Uses the same certificates from `ssl/` directory
   - Generated with `./setup-ssl.sh`
   - Auto-detected by Flask on startup

## Requirements

- Python 3.8 or higher
- ipatool CLI installed
- Node.js (only for building frontend)
- SSL certificates (run `./setup-ssl.sh`)

## Development

### Rebuilding the Frontend

When you make changes to the React frontend:

```bash
cd ipatool-frontend
npm run build
cd ..
# Restart Flask server
```

### Adding API Endpoints

Edit `app.py` and add new routes:

```python
@app.route('/api/your-endpoint', methods=['POST'])
def your_endpoint():
    # Your code here
    return jsonify({'status': 'ok'})
```

### Debugging

Enable Flask debug mode (don't use in production):

```python
# In app.py, change the last line to:
app.run(host='0.0.0.0', port=port, ssl_context=(cert, key), debug=True)
```

Or set environment variable:
```bash
FLASK_DEBUG=1 python3 app.py
```

## Accessing the Application

- **Frontend**: `https://your-ip:443` or `https://your-ip`
- **API**: `https://your-ip:443/api/health`
- **SSL Cert**: `https://your-ip:443/ssl/cert.pem`

## Troubleshooting

### Port 443 Already in Use

```bash
# Find what's using port 443
sudo lsof -i :443

# Kill the process
sudo kill -9 <PID>
```

### Permission Denied on Port 443

Ports below 1024 require root privileges:

```bash
# Run with sudo
sudo python3 app.py

# Or use a higher port
PORT=8443 python3 app.py
```

### Frontend Not Loading

Make sure the React app is built:

```bash
cd ipatool-frontend
npm run build
ls -la build/  # Should show index.html and static/
```

### ipatool Not Found

```bash
# Check if installed
which ipatool

# Install if needed
brew install ipatool
```

### SSL Certificate Issues

```bash
# Regenerate certificates
./setup-ssl.sh

# Check they exist
ls -la ssl/
```

## Migrating from Node.js

If you were using the old Node.js setup:

1. Stop the old servers (Ctrl+C on both backend and frontend)
2. Build the frontend: `cd ipatool-frontend && npm run build`
3. Install Python dependencies: `pip install -r requirements.txt`
4. Run Flask: `./run-flask.sh`

Your existing SSL certificates and configuration will work as-is.

## Production Deployment

For production, consider:

1. **Use a production WSGI server** (Gunicorn):
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:443 --certfile ssl/cert.pem --keyfile ssl/key.pem app:app
   ```

2. **Use systemd** for auto-start:
   Create `/etc/systemd/system/ipatool-web.service`

3. **Use Let's Encrypt** for valid SSL certificates
   See SSL-SETUP.md for instructions

4. **Set up nginx** as reverse proxy (optional but recommended)
   See SSL-SETUP.md for configuration

## Environment Variables

- `PORT`: Server port (default: 443)
- `FLASK_DEBUG`: Enable debug mode (default: off)

## File Structure

```
ipatool-web/
├── app.py                    # Main Flask application
├── requirements.txt          # Python dependencies
├── run-flask.sh             # Startup script
├── setup-ssl.sh             # SSL certificate generator
├── ssl/                     # SSL certificates
│   ├── cert.pem
│   └── key.pem
├── ipatool-frontend/        # React frontend
│   ├── build/              # Production build (served by Flask)
│   ├── src/                # Source code
│   └── package.json
├── backend/                 # Old Node.js backend (can be removed)
└── venv/                   # Python virtual environment
```

## Benefits of Flask Version

1. **Single Port**: Everything on port 443
2. **Simpler Deployment**: One process instead of two
3. **Less Memory**: No need for React dev server
4. **Better Logging**: Unified logs in one place
5. **Easier SSL**: One SSL configuration
6. **Production Ready**: Flask is production-grade

## Need the Old Node.js Version?

The old setup still works:

```bash
# Backend (terminal 1)
cd backend && npm start

# Frontend (terminal 2)
cd ipatool-frontend && npm start
```

But the Flask version is recommended for production use.
