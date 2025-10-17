# SSL/HTTPS Setup Guide

This guide explains how to set up HTTPS for ipatool-web to enable OTA (Over-The-Air) installation of iOS apps.

## Quick Start (Self-Signed Certificate)

1. **Generate SSL certificates:**
   ```bash
   cd ~/ipatool-web
   ./setup-ssl.sh
   ```

2. **Start the servers:**
   ```bash
   ./run.sh
   ```

3. **Access the app via HTTPS:**
   - Backend: `https://YOUR_SERVER_IP:3001`
   - Frontend: `https://YOUR_SERVER_IP:3000`

## Trust Self-Signed Certificate on iOS

To enable OTA installation with a self-signed certificate:

### Step 1: Download Certificate
1. Open Safari on your iOS device
2. Navigate to: `https://YOUR_SERVER_IP:3001/ssl/cert.pem`
3. Tap "Allow" when prompted to download the configuration profile

### Step 2: Install Certificate
1. Go to **Settings** > **General** > **VPN & Device Management**
2. Find "ipatool-web" under "Downloaded Profile"
3. Tap **Install** and enter your passcode
4. Tap **Install** again to confirm

### Step 3: Trust Certificate
1. Go to **Settings** > **General** > **About** > **Certificate Trust Settings**
2. Enable **full trust** for "ipatool-web"
3. Tap **Continue** to confirm

### Step 4: Test Installation
1. Open `https://YOUR_SERVER_IP:3000` in Safari
2. Search for an app
3. Tap the **Install** button
4. The app should begin installing directly on your device

## Production Setup (Let's Encrypt)

For production use, we recommend using a valid SSL certificate from Let's Encrypt:

### Prerequisites
- A domain name pointing to your server
- Port 80 and 443 open on your firewall

### Install Certbot
```bash
sudo apt update
sudo apt install certbot
```

### Generate Certificate
```bash
# Stop the current servers
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be generated at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### Use Let's Encrypt Certificates
```bash
cd ~/ipatool-web
mkdir -p ssl

# Create symlinks to Let's Encrypt certificates
sudo ln -s /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo ln -s /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem

# Fix permissions
sudo chown $USER:$USER ssl/cert.pem ssl/key.pem
```

### Auto-Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Set up auto-renewal (runs twice daily)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Using Nginx Reverse Proxy (Recommended)

For better performance and easier certificate management, use nginx as a reverse proxy:

### Install Nginx
```bash
sudo apt install nginx
```

### Configure Nginx
Create `/etc/nginx/sites-available/ipatool-web`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/ipatool-web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Troubleshooting

### Certificate Not Trusted
- Make sure you installed AND trusted the certificate on iOS
- Check Settings > General > About > Certificate Trust Settings

### "Cannot Download App" Error
- Verify HTTPS is working: `curl -k https://YOUR_IP:3001/api/health`
- Check that the manifest.plist is accessible
- Ensure the .ipa file hasn't been deleted from `/tmp`

### Mixed Content Errors
- Make sure both frontend and backend use HTTPS
- Update `.env` file to use `https://` URLs

### Port Already in Use
```bash
# Find what's using the port
sudo lsof -i :3001

# Kill the process
sudo kill -9 <PID>
```

## Security Notes

⚠️ **Self-signed certificates are for development/testing only!**

For production:
- Use a valid certificate from Let's Encrypt or another CA
- Keep your private key secure (`chmod 600`)
- Never commit certificates to git
- Rotate certificates regularly
- Use strong cipher suites in production

## Environment Variables

Update `ipatool-frontend/.env` to use HTTPS:
```bash
REACT_APP_API_URL=https://YOUR_SERVER_IP:3001/api
```

Or for production with nginx:
```bash
REACT_APP_API_URL=https://yourdomain.com/api
```
