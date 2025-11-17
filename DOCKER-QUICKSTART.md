# Docker Quick Start Guide

Get ipatool-web running on your VPS in 3 simple steps!

## Prerequisites

- A VPS with Ubuntu 20.04+ / Debian 10+ / CentOS 8+
- SSH access to your VPS
- A domain name (optional, but recommended for production)

## Step 1: Clone and Setup

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Clone the repository
git clone <your-repository-url> ipatool-web
cd ipatool-web

# Run the automated deployment script
./deploy.sh
```

The script will:
- Install Docker and Docker Compose (if not already installed)
- Generate SSL certificates (self-signed by default)
- Build the application containers
- Start all services

**Alternative:** If SSL generation fails, you can generate certificates manually first:
```bash
./generate-ssl-auto.sh
./deploy.sh
```

## Step 2: Configure Firewall

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=8443/tcp
sudo firewall-cmd --reload
```

## Step 3: Access Your Application

Open your browser and navigate to:
- **Frontend**: `https://your-vps-ip:8443`
- **Backend**: `https://your-vps-ip:443`

Accept the self-signed certificate warning (or install proper SSL certificates for production).

## That's It!

Your ipatool-web application is now running in Docker containers with:
- ✅ Automatic restarts
- ✅ Isolated environment
- ✅ Easy updates
- ✅ All dependencies included

## Common Commands

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop services
docker compose stop

# Start services
docker compose start

# Update to latest version
git pull && docker compose up -d --build
```

## Production Setup (Optional)

For production deployment with a domain name:

1. **Get a domain name** and point it to your VPS IP

2. **Install Let's Encrypt SSL certificates:**
   ```bash
   sudo apt-get install certbot
   sudo certbot certonly --standalone -d your-domain.com

   # Copy certificates
   mkdir -p ssl
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
   sudo chmod 644 ssl/cert.pem
   sudo chmod 600 ssl/key.pem
   ```

3. **Configure environment:**
   ```bash
   # Edit .env file
   nano .env

   # Set your domain
   PUBLIC_HOSTNAME=your-domain.com:443
   REACT_APP_BACKEND_HOST=your-domain.com
   ```

4. **Restart services:**
   ```bash
   docker compose restart
   ```

## Troubleshooting

**Services won't start?**
```bash
# Check logs for errors
docker compose logs

# Check if ports are in use
sudo lsof -i :443
sudo lsof -i :8443
```

**Can't connect?**
- Check firewall settings
- Verify services are running: `docker compose ps`
- Check if ports are accessible: `curl -k https://localhost:443/api/health`

**Need help?**
- See detailed guide: [DOCKER-DEPLOY.md](DOCKER-DEPLOY.md)
- Check application docs: [README.md](README.md)
