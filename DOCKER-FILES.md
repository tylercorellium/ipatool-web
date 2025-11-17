# Docker Deployment Files Overview

This document lists all Docker-related files and their purposes.

## Docker Configuration Files

### Core Docker Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Orchestrates backend and frontend containers |
| `backend/Dockerfile` | Builds backend container with Node.js and ipatool |
| `ipatool-frontend/Dockerfile` | Builds frontend container with React and nginx |
| `ipatool-frontend/nginx.conf` | Nginx web server configuration |
| `backend/.dockerignore` | Excludes files from backend Docker build |
| `ipatool-frontend/.dockerignore` | Excludes files from frontend Docker build |

### Deployment Scripts

| File | Purpose | Usage |
|------|---------|-------|
| `deploy.sh` | Automated deployment script | `./deploy.sh` |
| `generate-ssl-auto.sh` | Non-interactive SSL certificate generation | `./generate-ssl-auto.sh [domain]` |
| `setup-ssl.sh` | Interactive SSL certificate generation | `./setup-ssl.sh` |
| `test-ssl.sh` | Test SSL certificate setup | `./test-ssl.sh` |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Environment variables template |
| `.env` | Your actual environment configuration (create from .env.example) |

### Documentation

| File | Purpose |
|------|---------|
| `DOCKER-DEPLOY.md` | Comprehensive deployment guide |
| `DOCKER-QUICKSTART.md` | Quick 3-step deployment guide |
| `SSL-CERTIFICATE-GUIDE.md` | Complete SSL setup and troubleshooting |
| `DOCKER-FILES.md` | This file - overview of all Docker files |

## Quick Reference

### First-Time Setup

```bash
# 1. Generate SSL certificates
./generate-ssl-auto.sh

# 2. Deploy everything
./deploy.sh
```

### Daily Operations

```bash
# Start services
docker compose start

# Stop services
docker compose stop

# Restart services
docker compose restart

# View logs
docker compose logs -f

# Update application
git pull && docker compose up -d --build
```

### SSL Certificate Management

```bash
# Test SSL setup
./test-ssl.sh

# Regenerate self-signed certificates
rm -f ssl/*.pem && ./generate-ssl-auto.sh

# Use custom domain
./generate-ssl-auto.sh your-domain.com
```

### Troubleshooting

```bash
# Check container status
docker compose ps

# View logs for specific service
docker compose logs backend
docker compose logs frontend

# Rebuild containers
docker compose build --no-cache
docker compose up -d

# Clean up everything
docker compose down -v
```

## File Locations

```
ipatool-web/
├── docker-compose.yml          # Main orchestration file
├── .env.example                # Environment template
├── .env                        # Your environment (create this)
│
├── deploy.sh                   # Main deployment script
├── generate-ssl-auto.sh        # Auto SSL generation
├── setup-ssl.sh                # Interactive SSL generation
├── test-ssl.sh                 # SSL testing script
│
├── ssl/                        # SSL certificates directory
│   ├── cert.pem               # Public certificate
│   └── key.pem                # Private key
│
├── backend/
│   ├── Dockerfile             # Backend container definition
│   ├── .dockerignore          # Excluded files
│   └── ... (application files)
│
├── ipatool-frontend/
│   ├── Dockerfile             # Frontend container definition
│   ├── nginx.conf             # Web server config
│   ├── .dockerignore          # Excluded files
│   └── ... (application files)
│
└── docs/
    ├── DOCKER-DEPLOY.md        # Full deployment guide
    ├── DOCKER-QUICKSTART.md    # Quick start guide
    ├── SSL-CERTIFICATE-GUIDE.md # SSL documentation
    └── DOCKER-FILES.md         # This file
```

## Environment Variables

Key environment variables (set in `.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_HOSTNAME` | `ipatool-web:443` | Public hostname for manifest URLs |
| `BACKEND_PORT` | `443` | Backend HTTPS port |
| `REDIRECT_PORT` | `3000` | HTTP redirect port |
| `REACT_APP_BACKEND_HOST` | `localhost` | Frontend → Backend hostname |
| `REACT_APP_BACKEND_PORT` | `443` | Frontend → Backend port |
| `NODE_ENV` | `production` | Node environment |

## Ports

| Port | Service | Protocol | Purpose |
|------|---------|----------|---------|
| 443 | Backend | HTTPS | API endpoints |
| 3000 | Backend | HTTP | Redirect to HTTPS |
| 8443 | Frontend | HTTPS | Web interface |
| 80 | Frontend | HTTP | Redirect to HTTPS |

## Volumes

| Volume | Purpose |
|--------|---------|
| `./ssl:/app/ssl` | SSL certificates (backend) |
| `./ssl:/etc/nginx/ssl` | SSL certificates (frontend) |
| `ipatool-tmp:/tmp` | Temporary IPA file storage |

## Networks

| Network | Purpose |
|---------|---------|
| `ipatool-network` | Internal communication between containers |

## Health Checks

Both containers include health checks:

- **Backend**: Checks `/api/health` endpoint every 30s
- **Frontend**: Checks nginx is responding every 30s

View health status:
```bash
docker compose ps
```

## Updating

### Update Application Code

```bash
git pull
docker compose up -d --build
```

### Update Docker Images

```bash
# Pull latest base images
docker compose pull

# Rebuild containers
docker compose build --pull

# Restart with new images
docker compose up -d
```

### Update SSL Certificates

```bash
# For self-signed (before they expire)
rm ssl/*.pem
./generate-ssl-auto.sh
docker compose restart

# For Let's Encrypt
sudo certbot renew
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
docker compose restart
```

## Security Notes

1. **Never commit** `.env` or `ssl/` directory to version control
2. **Keep `ssl/key.pem` secret** - it's your private key
3. **Use Let's Encrypt** for production deployments
4. **Update regularly** - run `git pull` and rebuild monthly
5. **Monitor logs** - check for suspicious activity

## Performance Tips

1. **Resource Limits**: Edit `docker-compose.yml` to add CPU/memory limits
2. **Log Rotation**: Configure in Docker daemon settings
3. **Volume Cleanup**: Run `docker volume prune` periodically
4. **Image Cleanup**: Run `docker image prune` after updates

## Getting Help

1. **Check logs first**: `docker compose logs`
2. **Run SSL test**: `./test-ssl.sh`
3. **Verify status**: `docker compose ps`
4. **Check resources**: `docker stats`

For detailed guides, see:
- [DOCKER-DEPLOY.md](DOCKER-DEPLOY.md) - Full deployment guide
- [SSL-CERTIFICATE-GUIDE.md](SSL-CERTIFICATE-GUIDE.md) - SSL setup and troubleshooting
- [README.md](README.md) - Application documentation
