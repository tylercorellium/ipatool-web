const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Store active sessions temporarily (in production, use Redis or similar)
const activeSessions = new Map();

// Helper function to execute ipatool commands
function executeIpatool(args, options = {}) {
  return new Promise((resolve, reject) => {
    const ipatool = spawn('ipatool', args);
    let stdout = '';
    let stderr = '';

    if (options.streamResponse) {
      // For download operations, return the process for streaming
      resolve(ipatool);
      return;
    }

    ipatool.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ipatool.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ipatool.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`ipatool exited with code ${code}: ${stderr}`));
      }
    });

    ipatool.on('error', (error) => {
      reject(new Error(`Failed to start ipatool: ${error.message}`));
    });
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('ipatool-web backend is running!');
});

// Authentication endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password, code } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Build ipatool auth command
    const args = ['auth', 'login', '-e', email, '-p', password];

    if (code) {
      args.push('-c', code);
    }

    const result = await executeIpatool(args);

    // Generate a session token (in production, use proper JWT or session management)
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeSessions.set(sessionToken, { email, timestamp: Date.now() });

    // Check if 2FA is required
    if (result.stderr.includes('two-factor') || result.stderr.includes('2FA')) {
      return res.json({
        success: false,
        requiresTwoFactor: true,
        message: 'Two-factor authentication code required'
      });
    }

    res.json({
      success: true,
      sessionToken,
      message: 'Authentication successful'
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { query, email, password } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (!email || !password) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Execute ipatool search
    const args = ['search', query, '-e', email, '-p', password, '--limit', '50'];
    const result = await executeIpatool(args);

    // Parse the output to extract app information
    // ipatool typically outputs in a structured format
    const apps = parseSearchResults(result.stdout);

    res.json({ success: true, apps });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

// Download endpoint
app.post('/api/download', async (req, res) => {
  const { bundleId, email, password } = req.body;

  if (!bundleId) {
    return res.status(400).json({ error: 'Bundle ID is required' });
  }

  if (!email || !password) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Create a temporary directory for the download
    const outputPath = `/tmp/ipatool_${Date.now()}`;

    // Execute ipatool purchase (if needed) and download
    const args = [
      'download',
      '-b', bundleId,
      '-e', email,
      '-p', password,
      '-o', outputPath
    ];

    const ipatool = spawn('ipatool', args);
    let downloadStarted = false;
    let errorOutput = '';

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${bundleId}.ipa"`);

    ipatool.stdout.on('data', (data) => {
      if (!downloadStarted) {
        downloadStarted = true;
      }
      // Stream the file data to response
      res.write(data);
    });

    ipatool.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log('ipatool stderr:', data.toString());
    });

    ipatool.on('close', (code) => {
      if (code === 0) {
        res.end();
      } else {
        if (!downloadStarted) {
          res.status(500).json({
            error: 'Download failed',
            details: errorOutput
          });
        } else {
          res.end();
        }
      }
    });

    ipatool.on('error', (error) => {
      console.error('Download error:', error);
      if (!downloadStarted) {
        res.status(500).json({
          error: 'Download failed',
          details: error.message
        });
      } else {
        res.end();
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Download failed',
      details: error.message
    });
  }
});

// Helper function to parse search results
function parseSearchResults(output) {
  const apps = [];
  const lines = output.split('\n').filter(line => line.trim());

  // ipatool search output format parsing
  // This is a simplified parser - adjust based on actual ipatool output format
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for lines that contain app information
    // Typical format includes bundle ID, name, version
    const bundleIdMatch = line.match(/Bundle ID:\s*([^\s]+)/i) ||
                         line.match(/([a-z0-9\.]+\.[a-z0-9\.]+)/i);
    const nameMatch = line.match(/Name:\s*(.+?)(?:\s+Version:|$)/i);
    const versionMatch = line.match(/Version:\s*([^\s]+)/i);

    if (bundleIdMatch || nameMatch) {
      // Try to extract app info from the line or surrounding lines
      let appInfo = {
        bundleId: bundleIdMatch ? bundleIdMatch[1] : '',
        name: nameMatch ? nameMatch[1].trim() : '',
        version: versionMatch ? versionMatch[1] : '',
        icon: '' // ipatool may not provide icons directly
      };

      // If we have minimal info, try to extract from context
      if (!appInfo.name && line.length > 0) {
        appInfo.name = line.trim();
      }

      if (appInfo.bundleId || appInfo.name) {
        apps.push(appInfo);
      }
    }
  }

  // If no structured results found, try alternative parsing
  if (apps.length === 0 && output.includes('|')) {
    // Table format parsing
    const tableLines = lines.filter(l => l.includes('|'));
    for (const line of tableLines) {
      if (line.includes('---')) continue; // Skip separator lines
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      if (parts.length >= 3) {
        apps.push({
          name: parts[0] || '',
          bundleId: parts[1] || '',
          version: parts[2] || '',
          icon: ''
        });
      }
    }
  }

  return apps;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
