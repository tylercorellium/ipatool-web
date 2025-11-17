# Docker Deployment Guide for ipatool-web

This guide explains how to deploy ipatool-web on a VPS using Docker and Docker Compose.

## Prerequisites

Your VPS should have:
- Docker (20.10 or higher)
- Docker Compose (2.0 or higher)
- Git (to clone the repository)

## Quick Start

### 1. Install Docker and Docker Compose

On Ubuntu/Debian:
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verify installations
docker --version
docker compose version
```

On CentOS/RHEL:
```bash
# Install Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verify installations
docker --version
docker compose version
```

### 2. Clone the Repository

```bash
git clone <your-repository-url> ipatool-web
cd ipatool-web
```

### 3. Generate SSL Certificates

The application requires SSL certificates for HTTPS. You can generate self-signed certificates or use Let's Encrypt.

#### Option A: Self-Signed Certificates (Development/Testing)

**Method 1: Automated (Recommended)**
```bash
# Fully automated - no prompts
./generate-ssl-auto.sh

# Or specify a custom domain
./generate-ssl-auto.sh your-domain.com
```

**Method 2: Interactive**
```bash
# Interactive mode with prompts
./setup-ssl.sh
```

**Method 3: Manual**
```bash
# Manual OpenSSL command
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem
```

**Note:** Self-signed certificates will show security warnings in browsers. You'll need to install the certificate on iOS devices for OTA installation.

#### Option B: Let's Encrypt Certificates (Production)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate (replace with your domain)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to ssl directory
mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
sudo chmod 644 ssl/cert.pem
sudo chmod 600 ssl/key.pem
```

### 4. Configure Environment Variables (Optional)

Create a `.env` file in the project root to customize settings:

```bash
# Public hostname for manifest URLs (important for OTA installation)
PUBLIC_HOSTNAME=your-domain.com:443

# Backend configuration
BACKEND_PORT=443

# Frontend configuration (if backend is on different host/port)
REACT_APP_BACKEND_HOST=your-domain.com
REACT_APP_BACKEND_PORT=443
```

### 5. Build and Start the Application

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

The services will be available at:
- Backend: `https://your-server-ip:443`
- Frontend: `https://your-server-ip:8443`

### 6. Verify Installation

```bash
# Check if containers are running
docker compose ps

# Test backend health
curl -k https://localhost:443/api/health

# Check logs for any errors
docker compose logs backend
docker compose logs frontend
```

## Updating the Application

To update to the latest version:

```bash
# Stop the containers
docker compose down

# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Clean up old images (optional)
docker image prune -f
```

## Managing the Application

### Start Services
```bash
docker compose start
```

### Stop Services
```bash
docker compose stop
```

### Restart Services
```bash
docker compose restart
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
```

### Remove Everything
```bash
# Stop and remove containers, networks, and volumes
docker compose down -v
```

## Firewall Configuration

Ensure your firewall allows the following ports:

```bash
# Ubuntu/Debian (using ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp

# CentOS/RHEL (using firewalld)
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=8443/tcp
sudo firewall-cmd --reload
```

## Troubleshooting

### Containers Won't Start

Check logs for errors:
```bash
docker compose logs
```

Common issues:
- **Port already in use**: Another service is using ports 443, 8443, or 80
  - Solution: Stop the conflicting service or change ports in `docker-compose.yml`
- **Permission denied**: Docker needs root/sudo access
  - Solution: Add your user to the docker group: `sudo usermod -aG docker $USER`

### SSL Certificate Errors

If you see SSL-related errors:

**Check if certificates exist:**
```bash
ls -la ssl/
```

**Verify certificate validity:**
```bash
openssl x509 -in ssl/cert.pem -text -noout
```

**Common SSL Issues:**

1. **OpenSSL not installed:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install openssl

   # CentOS/RHEL
   sudo yum install openssl
   ```

2. **Permission errors:**
   ```bash
   sudo chmod 644 ssl/cert.pem
   sudo chmod 600 ssl/key.pem
   sudo chown $(whoami):$(whoami) ssl/*.pem
   ```

3. **Certificates won't generate:**
   ```bash
   # Remove old certificates and try again
   rm -f ssl/cert.pem ssl/key.pem

   # Use the automated script
   ./generate-ssl-auto.sh

   # Or manual method
   mkdir -p ssl
   openssl req -x509 -newkey rsa:4096 -nodes \
     -keyout ssl/key.pem \
     -out ssl/cert.pem \
     -days 365 \
     -subj "/C=US/ST=State/L=City/O=ipatool/CN=localhost"
   ```

4. **"command not found: openssl":**
   Your system doesn't have OpenSSL installed. Install it using your package manager (see above).

5. **Docker can't read certificates:**
   ```bash
   # Check certificate paths in docker-compose.yml
   # Ensure the ./ssl directory exists and is readable
   sudo chmod 755 ssl/
   ```

### Backend Can't Find ipatool

The backend container builds ipatool from source. If there are issues:
```bash
# Check if ipatool is installed in the container
docker compose exec backend ipatool --version

# Rebuild the backend if needed
docker compose build --no-cache backend
docker compose up -d
```

### Frontend Can't Connect to Backend

Check the frontend logs:
```bash
docker compose logs frontend
```

Verify backend is accessible:
```bash
curl -k https://localhost:443/api/health
```

If using a custom domain, ensure environment variables are set correctly in `.env`.

### OTA Installation Not Working

For iOS OTA installation to work:
1. Backend must be accessible via HTTPS with a valid hostname
2. Set `PUBLIC_HOSTNAME` environment variable to your domain
3. iOS device must trust the SSL certificate

## Performance Tuning

### Resource Limits

Add resource limits to `docker-compose.yml`:

```yaml
services:
  backend:
    # ... other config ...
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Enable Log Rotation

Prevent logs from filling disk space:

```bash
# Edit Docker daemon config
sudo nano /etc/docker/daemon.json
```

Add:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker:
```bash
sudo systemctl restart docker
docker compose up -d
```

## Security Considerations

1. **Change Default Ports**: Modify ports in `docker-compose.yml` if needed
2. **Use Real SSL Certificates**: Use Let's Encrypt for production
3. **Enable Firewall**: Only allow necessary ports
4. **Keep Updated**: Regularly pull updates and rebuild containers
5. **Monitor Logs**: Check logs for suspicious activity
6. **Backup**: Regularly backup your configuration and SSL certificates

## Backup and Restore

### Backup
```bash
# Backup SSL certificates and config
tar -czf ipatool-backup-$(date +%Y%m%d).tar.gz ssl/ docker-compose.yml .env

# Backup volumes (if using persistent data)
docker run --rm -v ipatool-tmp:/data -v $(pwd):/backup alpine tar czf /backup/volumes-backup.tar.gz -C /data .
```

### Restore
```bash
# Restore config
tar -xzf ipatool-backup-YYYYMMDD.tar.gz

# Restore volumes
docker run --rm -v ipatool-tmp:/data -v $(pwd):/backup alpine tar xzf /backup/volumes-backup.tar.gz -C /data

# Restart services
docker compose up -d
```

## Support

For issues specific to Docker deployment, check:
- Docker logs: `docker compose logs`
- Container status: `docker compose ps`
- System resources: `docker stats`

For application issues, refer to the main [README.md](README.md).
