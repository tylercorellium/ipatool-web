#!/bin/bash

# Test SSL certificate setup for ipatool-web

echo "=========================================="
echo "  SSL Certificate Test"
echo "=========================================="
echo ""

# Check if certificates exist
echo "1️⃣  Checking for SSL certificates..."
if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
    echo "   ✅ Certificates found"
else
    echo "   ❌ Certificates not found"
    echo ""
    echo "Run one of these commands to generate certificates:"
    echo "   ./generate-ssl-auto.sh"
    echo "   ./setup-ssl.sh"
    exit 1
fi
echo ""

# Check certificate permissions
echo "2️⃣  Checking certificate permissions..."
CERT_PERMS=$(stat -c "%a" ssl/cert.pem 2>/dev/null || stat -f "%OLp" ssl/cert.pem 2>/dev/null)
KEY_PERMS=$(stat -c "%a" ssl/key.pem 2>/dev/null || stat -f "%OLp" ssl/key.pem 2>/dev/null)

echo "   cert.pem: $CERT_PERMS (should be 644)"
echo "   key.pem:  $KEY_PERMS (should be 600)"

if [ "$CERT_PERMS" = "644" ] && [ "$KEY_PERMS" = "600" ]; then
    echo "   ✅ Permissions are correct"
elif [ "$CERT_PERMS" = "644" ] || [ "$KEY_PERMS" = "600" ]; then
    echo "   ⚠️  Permissions are acceptable"
else
    echo "   ⚠️  Permissions should be fixed:"
    echo "      chmod 644 ssl/cert.pem"
    echo "      chmod 600 ssl/key.pem"
fi
echo ""

# Verify certificate validity
echo "3️⃣  Verifying certificate validity..."
if openssl x509 -in ssl/cert.pem -noout -checkend 0 2>/dev/null; then
    echo "   ✅ Certificate is valid"

    # Show certificate details
    SUBJECT=$(openssl x509 -in ssl/cert.pem -noout -subject 2>/dev/null | sed 's/subject=//')
    ISSUER=$(openssl x509 -in ssl/cert.pem -noout -issuer 2>/dev/null | sed 's/issuer=//')
    NOT_BEFORE=$(openssl x509 -in ssl/cert.pem -noout -startdate 2>/dev/null | sed 's/notBefore=//')
    NOT_AFTER=$(openssl x509 -in ssl/cert.pem -noout -enddate 2>/dev/null | sed 's/notAfter=//')

    echo ""
    echo "   Subject:    $SUBJECT"
    echo "   Issuer:     $ISSUER"
    echo "   Valid from: $NOT_BEFORE"
    echo "   Valid to:   $NOT_AFTER"
else
    echo "   ❌ Certificate is invalid or expired"
    echo "   Regenerate with: ./generate-ssl-auto.sh"
fi
echo ""

# Check if certificate and key match
echo "4️⃣  Checking if certificate and key match..."
CERT_MODULUS=$(openssl x509 -noout -modulus -in ssl/cert.pem 2>/dev/null | openssl md5)
KEY_MODULUS=$(openssl rsa -noout -modulus -in ssl/key.pem 2>/dev/null | openssl md5)

if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
    echo "   ✅ Certificate and key match"
else
    echo "   ❌ Certificate and key do not match"
    echo "   Regenerate with: ./generate-ssl-auto.sh"
fi
echo ""

# Check Subject Alternative Names (SAN)
echo "5️⃣  Checking Subject Alternative Names..."
SAN=$(openssl x509 -in ssl/cert.pem -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -n1 | sed 's/^ *//')

if [ -n "$SAN" ]; then
    echo "   ✅ SAN found: $SAN"
else
    echo "   ⚠️  No SAN found (older OpenSSL or certificate)"
    echo "   This may cause issues with some browsers"
fi
echo ""

echo "=========================================="
echo "✅ SSL Certificate Test Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  - Start the application: ./deploy.sh"
echo "  - Or manually: docker compose up -d"
echo ""
