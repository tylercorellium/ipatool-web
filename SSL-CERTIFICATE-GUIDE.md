# SSL Certificate Setup Guide

This guide covers everything you need to know about SSL certificates for ipatool-web.

## Why SSL Certificates Are Required

ipatool-web requires HTTPS (SSL/TLS) for:
- **Security**: Protecting credentials during authentication
- **iOS OTA Installation**: Apple requires HTTPS for installing apps over-the-air
- **Modern Browsers**: Many features require secure contexts

## Quick Start - Three Methods

### Method 1: Automated Script (Recommended)

**Best for:** Automated deployments, CI/CD, quick setup

```bash
./generate-ssl-auto.sh
```

This script:
- ✅ Requires no user input
- ✅ Auto-detects server IP
- ✅ Works on Linux and macOS
- ✅ Includes Subject Alternative Names (SAN)
- ✅ Sets correct permissions automatically

### Method 2: Interactive Script

**Best for:** Custom domains, manual setup

```bash
./setup-ssl.sh
```

This script:
- Prompts for domain name
- Shows detailed certificate information
- Asks before overwriting existing certificates

### Method 3: Manual OpenSSL

**Best for:** Custom requirements, troubleshooting

```bash
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 \
  -subj "/C=US/ST=State/L=City/O=ipatool-web/CN=localhost"

chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem
```

## Production Setup - Let's Encrypt

For production deployments, use Let's Encrypt for trusted certificates:

### Prerequisites
- A domain name pointing to your server
- Port 80 open (for verification)

### Steps

1. **Install Certbot:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install certbot

   # CentOS/RHEL
   sudo yum install certbot
   ```

2. **Generate Certificate:**
   ```bash
   # Stop any services using port 80
   docker compose down

   # Generate certificate
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. **Copy Certificates:**
   ```bash
   mkdir -p ssl
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
   sudo chown $(whoami):$(whoami) ssl/*.pem
   chmod 644 ssl/cert.pem
   chmod 600 ssl/key.pem
   ```

4. **Update Configuration:**
   ```bash
   # Edit .env file
   echo "PUBLIC_HOSTNAME=your-domain.com:443" >> .env
   ```

5. **Restart Services:**
   ```bash
   docker compose up -d
   ```

### Auto-Renewal

Let's Encrypt certificates expire after 90 days. Set up auto-renewal:

```bash
# Create renewal script
cat > renew-ssl.sh << 'EOF'
#!/bin/bash
docker compose down
sudo certbot renew
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
sudo chown $(whoami):$(whoami) ssl/*.pem
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem
docker compose up -d
EOF

chmod +x renew-ssl.sh

# Add to crontab (runs monthly)
(crontab -l 2>/dev/null; echo "0 0 1 * * cd $(pwd) && ./renew-ssl.sh") | crontab -
```

## Testing Your SSL Setup

Use the included test script:

```bash
./test-ssl.sh
```

This will check:
- ✅ Certificates exist
- ✅ Permissions are correct
- ✅ Certificate is valid and not expired
- ✅ Certificate and key match
- ✅ Subject Alternative Names (SAN)

## Troubleshooting

### Problem: OpenSSL Not Found

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install openssl

# CentOS/RHEL
sudo yum install openssl

# macOS
brew install openssl
```

### Problem: Permission Denied

**Solution:**
```bash
sudo chown $(whoami):$(whoami) ssl/
chmod 755 ssl/
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem
```

### Problem: Certificate Shows as Untrusted

**For Self-Signed Certificates:**

**Desktop Browser:**
- Click "Advanced" or similar
- Click "Proceed" or "Accept Risk"
- Or import certificate to system trust store

**iOS Device:**
1. Visit `https://your-server-ip:443/ssl/cert.pem` in Safari
2. Tap "Allow" to download the profile
3. Go to Settings → General → VPN & Device Management
4. Tap the certificate profile and install it
5. Go to Settings → General → About → Certificate Trust Settings
6. Enable full trust for the certificate

**Android Device:**
1. Download the certificate
2. Go to Settings → Security → Install from storage
3. Select the certificate file

### Problem: "Certificate and Key Don't Match"

**Solution:**
```bash
# Remove old certificates
rm -f ssl/cert.pem ssl/key.pem

# Generate new ones
./generate-ssl-auto.sh

# Verify
./test-ssl.sh
```

### Problem: Certificate Expired

**Solution:**
```bash
# For self-signed certificates - regenerate
rm -f ssl/cert.pem ssl/key.pem
./generate-ssl-auto.sh

# For Let's Encrypt - renew
sudo certbot renew
# Then copy new certificates (see Production Setup above)
```

### Problem: Browser Shows "NET::ERR_CERT_AUTHORITY_INVALID"

This is **expected for self-signed certificates**. Options:

1. **Accept the warning** (for development/testing)
2. **Use Let's Encrypt** (for production)
3. **Import the certificate** to your system's trust store

### Problem: iOS Says "Cannot Connect Using SSL"

**Possible causes:**
1. Certificate not trusted on device → Install certificate (see above)
2. Certificate CN doesn't match hostname → Regenerate with correct domain
3. TLS version too old → Use modern OpenSSL version

**Solution:**
```bash
# Regenerate with correct domain
./generate-ssl-auto.sh your-domain.com

# Or use PUBLIC_HOSTNAME environment variable
echo "PUBLIC_HOSTNAME=your-domain.com:443" >> .env
docker compose restart
```

## Certificate Files Explained

- **`ssl/cert.pem`**: Public certificate (can be shared)
- **`ssl/key.pem`**: Private key (keep secret!)

**Permissions:**
- `cert.pem`: `644` (readable by all)
- `key.pem`: `600` (readable only by owner)

**Never commit** these files to version control!

## Security Best Practices

1. ✅ **Use Let's Encrypt for production**
2. ✅ **Keep private keys secure** (600 permissions)
3. ✅ **Renew certificates before expiry**
4. ✅ **Use strong encryption** (RSA 4096 or better)
5. ✅ **Enable HSTS** (done automatically by nginx config)
6. ✅ **Keep OpenSSL updated**

## FAQ

**Q: Can I use the same certificate for frontend and backend?**
A: Yes! Both services mount the same `./ssl` directory.

**Q: Do I need to rebuild containers after updating certificates?**
A: No, just restart: `docker compose restart`

**Q: Can I use certificates from a certificate authority?**
A: Yes! Just copy your `fullchain.pem` to `ssl/cert.pem` and `privkey.pem` to `ssl/key.pem`.

**Q: How do I check when my certificate expires?**
A: Run `openssl x509 -in ssl/cert.pem -noout -enddate`

**Q: Can I use a wildcard certificate?**
A: Yes! Just copy it to the `ssl/` directory with the correct filenames.

**Q: What if I don't want to use HTTPS?**
A: Not recommended, but you can modify `docker-compose.yml` and `nginx.conf` to use HTTP only. However, iOS OTA installation will not work.

## Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)

## Getting Help

If you're still having SSL issues:

1. Run `./test-ssl.sh` and share the output
2. Check logs: `docker compose logs`
3. Verify OpenSSL version: `openssl version`
4. Test certificate: `openssl x509 -in ssl/cert.pem -text -noout`
