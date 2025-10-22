#!/usr/bin/env python3
"""
ipatool-web Flask Application
A unified Flask server that provides both the API backend and serves the React frontend.
"""

import os
import subprocess
import json
import re
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory, Response
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, NotFound, InternalServerError
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='ipatool-frontend/build', static_url_path='')
CORS(app, origins=['https://localhost:*', 'https://127.0.0.1:*', 'https://10.*', 'https://192.168.*'], supports_credentials=True)

# Configuration
KEYCHAIN_PASSPHRASE = 'password'
TEMP_DIR = Path('/tmp')


def strip_ansi_codes(text):
    """Remove ANSI color codes from text."""
    return re.sub(r'\x1B\[[0-9;]*[a-zA-Z]', '', text)


def execute_ipatool(args, stream_output=False):
    """
    Execute ipatool command and return the result.

    Args:
        args: List of command arguments
        stream_output: If True, returns the process for streaming

    Returns:
        dict with stdout and stderr, or subprocess.Popen if stream_output=True
    """
    # Mask sensitive information in logs
    safe_args = ['***' if ('@' in arg or len(arg) > 20) else arg for arg in args]
    logger.info(f"[ipatool] Executing: ipatool {' '.join(safe_args)}")

    try:
        if stream_output:
            return subprocess.Popen(
                ['ipatool'] + args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

        result = subprocess.run(
            ['ipatool'] + args,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.stdout:
            logger.info(f"[ipatool stdout] {result.stdout.strip()}")
        if result.stderr:
            logger.info(f"[ipatool stderr] {result.stderr.strip()}")

        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, args, result.stdout, result.stderr)

        return {'stdout': result.stdout, 'stderr': result.stderr}

    except FileNotFoundError:
        logger.error("[ipatool] Command not found. Is ipatool installed?")
        raise Exception("ipatool is not installed or not in PATH")
    except subprocess.TimeoutExpired:
        logger.error("[ipatool] Command timed out")
        raise Exception("ipatool command timed out")
    except subprocess.CalledProcessError as e:
        logger.error(f"[ipatool] Command failed with exit code {e.returncode}")
        raise Exception(f"ipatool failed: {e.stderr}")


def parse_search_results(output):
    """Parse ipatool search output and extract app information."""
    output = strip_ansi_codes(output)
    apps = []

    # Try to find JSON in the output
    json_match = re.search(r'apps=(\[.*?\])\s+count=', output)

    if json_match:
        try:
            apps_data = json.loads(json_match.group(1))
            logger.info(f"[Parse] Found {len(apps_data)} apps in JSON format")

            return [
                {
                    'name': app.get('name', ''),
                    'bundleId': app.get('bundleID', ''),
                    'version': app.get('version', ''),
                    'icon': ''
                }
                for app in apps_data
            ]
        except json.JSONDecodeError as e:
            logger.error(f"[Parse] Failed to parse JSON: {e}")

    # Fallback parsing
    lines = [line.strip() for line in output.split('\n') if line.strip()]

    for line in lines:
        bundle_match = re.search(r'Bundle ID:\s*([^\s]+)', line, re.IGNORECASE) or \
                      re.search(r'([a-z0-9\.]+\.[a-z0-9\.]+)', line, re.IGNORECASE)
        name_match = re.search(r'Name:\s*(.+?)(?:\s+Version:|$)', line, re.IGNORECASE)
        version_match = re.search(r'Version:\s*([^\s]+)', line, re.IGNORECASE)

        if bundle_match or name_match:
            app_info = {
                'bundleId': bundle_match.group(1) if bundle_match else '',
                'name': name_match.group(1).strip() if name_match else line,
                'version': version_match.group(1) if version_match else '',
                'icon': ''
            }

            if app_info['bundleId'] or app_info['name']:
                apps.append(app_info)

    return apps


def find_ipa_file(bundle_id):
    """Find IPA file for a given bundle ID in temp directories."""
    ipa_dirs = list(TEMP_DIR.glob('ipatool_*'))

    for dir_path in ipa_dirs:
        if not dir_path.is_dir():
            continue

        ipa_files = list(dir_path.glob('*.ipa'))
        for ipa_file in ipa_files:
            if bundle_id in ipa_file.name:
                return ipa_file

    # Return any IPA file as fallback
    for dir_path in ipa_dirs:
        if not dir_path.is_dir():
            continue
        ipa_files = list(dir_path.glob('*.ipa'))
        if ipa_files:
            return ipa_files[0]

    return None


@app.route('/')
def index():
    """Serve the React frontend."""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from React build."""
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    else:
        # For React Router - serve index.html for unknown routes
        return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'timestamp': __import__('datetime').datetime.utcnow().isoformat()})


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate with iCloud credentials."""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    code = data.get('code')

    logger.info(f"[API] POST /api/auth/login - Email: {email[:3] if email else 'none'}***, Has password: {bool(password)}, Has 2FA: {bool(code)}")

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    try:
        args = ['auth', 'login', '--email', email, '--password', password,
                '--keychain-passphrase', KEYCHAIN_PASSPHRASE]

        if code:
            args.extend(['--code', code])

        logger.info("[API] Attempting authentication...")
        result = execute_ipatool(args)

        # Check if 2FA is required
        if 'two-factor' in result['stderr'].lower() or '2fa' in result['stderr'].lower():
            logger.info("[API] 2FA required")
            return jsonify({
                'success': False,
                'requiresTwoFactor': True,
                'message': 'Two-factor authentication code required'
            })

        logger.info("[API] Authentication successful")
        return jsonify({'success': True, 'message': 'Authentication successful'})

    except Exception as e:
        logger.error(f"[API] Authentication error: {str(e)}")
        return jsonify({'error': 'Authentication failed', 'details': str(e)}), 401


@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check if user is authenticated."""
    logger.info("[API] GET /api/auth/status")

    try:
        execute_ipatool(['auth', 'info', '--keychain-passphrase', KEYCHAIN_PASSPHRASE])
        logger.info("[API] User is authenticated")
        return jsonify({'authenticated': True, 'message': 'User is authenticated'})
    except Exception as e:
        logger.info(f"[API] User is not authenticated: {str(e)}")
        return jsonify({'authenticated': False, 'message': 'User is not authenticated'})


@app.route('/api/search', methods=['POST'])
def search():
    """Search for iOS applications."""
    data = request.get_json()
    query = data.get('query')

    logger.info(f"[API] POST /api/search - Query: {query}")

    if not query:
        return jsonify({'error': 'Search query is required'}), 400

    try:
        args = ['search', query, '--keychain-passphrase', KEYCHAIN_PASSPHRASE, '--limit', '50']
        logger.info("[API] Executing search...")
        result = execute_ipatool(args)

        apps = parse_search_results(result['stdout'])
        logger.info(f"[API] Search found {len(apps)} apps")

        return jsonify({'success': True, 'apps': apps})

    except Exception as e:
        logger.error(f"[API] Search error: {str(e)}")
        return jsonify({'error': 'Search failed', 'details': str(e)}), 500


@app.route('/api/download', methods=['POST'])
def download():
    """Download IPA file."""
    data = request.get_json()
    bundle_id = data.get('bundleId')
    direct_download = data.get('directDownload', False)

    logger.info(f"[API] POST /api/download - Bundle ID: {bundle_id}, Direct: {direct_download}")

    if not bundle_id:
        return jsonify({'error': 'Bundle ID is required'}), 400

    try:
        # Create temporary output directory
        timestamp = __import__('time').time_ns()
        output_dir = TEMP_DIR / f'ipatool_{timestamp}'
        output_dir.mkdir(parents=True, exist_ok=True)

        # Execute download
        args = [
            'download',
            '--bundle-identifier', bundle_id,
            '--keychain-passphrase', KEYCHAIN_PASSPHRASE,
            '--output', str(output_dir)
        ]

        logger.info("[API] Downloading IPA...")
        execute_ipatool(args)
        logger.info("[API] Download command completed")

        # Find the IPA file
        ipa_files = list(output_dir.glob('*.ipa'))
        if not ipa_files:
            raise Exception('No .ipa file found after download')

        ipa_file = ipa_files[0]
        logger.info(f"[API] IPA file found: {ipa_file.name}")

        if direct_download:
            return send_file(
                ipa_file,
                as_attachment=True,
                download_name=ipa_file.name,
                mimetype='application/octet-stream'
            )
        else:
            # Return metadata for OTA installation
            return jsonify({
                'success': True,
                'filename': ipa_file.name,
                'bundleId': bundle_id,
                'downloadUrl': f'/api/download-file/{ipa_file.name}',
                'manifestUrl': f'/api/manifest/{bundle_id}',
                'message': 'IPA ready for installation'
            })

    except Exception as e:
        logger.error(f"[API] Download error: {str(e)}")
        return jsonify({'error': 'Download failed', 'details': str(e)}), 500


@app.route('/api/manifest/<bundle_id>', methods=['GET'])
def manifest(bundle_id):
    """Generate manifest.plist for OTA installation."""
    logger.info(f"[API] GET /api/manifest/{bundle_id}")

    # Find IPA file
    ipa_file = find_ipa_file(bundle_id)

    if not ipa_file:
        logger.error(f"[API] No IPA file found for bundle ID: {bundle_id}")
        return jsonify({'error': 'IPA file not found for this bundle ID'}), 404

    # Extract app name from bundle ID
    app_name = bundle_id.split('.')[-1].capitalize()

    # Get base URL
    protocol = request.headers.get('X-Forwarded-Proto', request.scheme)
    host = request.headers.get('Host')
    base_url = f"https://{host}"  # Force HTTPS

    ipa_url = f"{base_url}/api/download-file/{ipa_file.name}"

    logger.info(f"[API] Generating manifest for: {ipa_file.name}")
    logger.info(f"[API] Base URL: {base_url}")
    logger.info(f"[API] IPA URL: {ipa_url}")

    # Generate manifest
    manifest_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>{ipa_url}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>{bundle_id}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>{app_name}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>'''

    logger.info("[API] ========== MANIFEST RESPONSE ==========")
    logger.info(manifest_content)
    logger.info("[API] ============================================")

    return Response(manifest_content, mimetype='application/xml')


@app.route('/api/manifest/<bundle_id>/debug', methods=['GET'])
def manifest_debug(bundle_id):
    """Debug view of manifest with metadata."""
    ipa_file = find_ipa_file(bundle_id)

    if not ipa_file:
        return f"No IPA file found for bundle ID: {bundle_id}\n\nChecked directories in /tmp starting with 'ipatool_'", 404

    app_name = bundle_id.split('.')[-1].capitalize()
    protocol = request.headers.get('X-Forwarded-Proto', request.scheme)
    host = request.headers.get('Host')
    base_url = f"https://{host}"
    ipa_url = f"{base_url}/api/download-file/{ipa_file.name}"

    debug_info = f'''Protocol detected: {protocol}
Host: {host}
Base URL: {base_url}
IPA File: {ipa_file.name}
IPA URL: {ipa_url}
Bundle ID: {bundle_id}
App Name: {app_name}

---MANIFEST---
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>{ipa_url}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>{bundle_id}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>{app_name}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>'''

    return Response(debug_info, mimetype='text/plain')


@app.route('/api/download-file/<filename>', methods=['GET'])
def download_file(filename):
    """Serve IPA file for OTA installation."""
    logger.info(f"[API] GET /api/download-file/{filename}")

    # Find the file
    ipa_dirs = list(TEMP_DIR.glob('ipatool_*'))

    for dir_path in ipa_dirs:
        if not dir_path.is_dir():
            continue

        file_path = dir_path / filename
        if file_path.exists():
            logger.info(f"[API] Found IPA at: {file_path}")
            file_size = file_path.stat().st_size
            logger.info(f"[API] IPA file size: {file_size} bytes")

            return send_file(
                file_path,
                mimetype='application/octet-stream',
                as_attachment=True,
                download_name=filename
            )

    logger.error(f"[API] File not found: {filename}")
    return jsonify({'error': 'File not found'}), 404


@app.route('/ssl/cert.pem', methods=['GET'])
def ssl_cert():
    """Serve SSL certificate for iOS installation."""
    cert_path = Path(__file__).parent / 'ssl' / 'cert.pem'

    if cert_path.exists():
        return send_file(
            cert_path,
            mimetype='application/x-x509-ca-cert',
            as_attachment=True,
            download_name='ipatool-web.crt'
        )
    else:
        return jsonify({'error': 'Certificate not found'}), 404


if __name__ == '__main__':
    # Check for SSL certificates
    ssl_dir = Path(__file__).parent / 'ssl'
    cert_path = ssl_dir / 'cert.pem'
    key_path = ssl_dir / 'key.pem'

    port = int(os.environ.get('PORT', 443))

    if cert_path.exists() and key_path.exists():
        logger.info("=" * 50)
        logger.info("🔒 Starting HTTPS Flask Server")
        logger.info("=" * 50)
        logger.info(f"Server: https://0.0.0.0:{port}")
        logger.info(f"Local:  https://localhost:{port}")
        logger.info("\n📱 OTA Installation: ENABLED")
        logger.info("   iOS devices can install apps directly")
        logger.info("\n⚠️  Self-signed certificate requires trust:")
        logger.info(f"   Download cert: https://<your-ip>:{port}/ssl/cert.pem")
        logger.info("   Install on iOS and enable in Certificate Trust Settings")
        logger.info("=" * 50)

        # Run with SSL
        app.run(
            host='0.0.0.0',
            port=port,
            ssl_context=(str(cert_path), str(key_path)),
            debug=False
        )
    else:
        logger.info("=" * 50)
        logger.info("🔓 Starting HTTP Flask Server (no SSL)")
        logger.info("=" * 50)
        logger.info(f"Server: http://0.0.0.0:{port}")
        logger.info(f"Local:  http://localhost:{port}")
        logger.info("\n⚠️  OTA Installation: DISABLED")
        logger.info("   SSL certificate not found")
        logger.info("   Run './setup-ssl.sh' to generate certificates")
        logger.info("=" * 50)

        app.run(host='0.0.0.0', port=port, debug=False)
