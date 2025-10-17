import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Avatar,
  Box,
  Alert,
  CircularProgress,
  Chip,
  ButtonGroup
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import AppleIcon from '@mui/icons-material/Apple';
import { App } from '../types';
import { BACKEND_BASE_URL } from '../api';

interface AppListProps {
  apps: App[];
  onDownload: (bundleId: string) => Promise<void>;
}

const AppList: React.FC<AppListProps> = ({ apps, onDownload }) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHttps, setIsHttps] = useState(window.location.protocol === 'https:');

  const handleDownload = async (bundleId: string) => {
    setDownloadingId(bundleId);
    setError(null);
    try {
      await onDownload(bundleId);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleInstall = (bundleId: string, appName: string) => {
    // Generate the itms-services URL for OTA installation
    const baseUrl = BACKEND_BASE_URL;
    const filename = `${appName}.ipa`;
    const manifestUrl = `${baseUrl}/api/manifest/${encodeURIComponent(filename)}`;
    const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;

    if (!isHttps) {
      setError('Direct installation requires HTTPS. Please download the IPA file instead.');
      return;
    }

    // Open the installation URL
    window.location.href = installUrl;
  };

  if (apps.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AppleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No apps found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try searching for a different app name or Bundle ID
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {!isHttps && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Direct installation requires HTTPS. Currently using HTTP - Install button will download instead.
          Configure HTTPS to enable OTA installation.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(1, 1fr)',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
          },
          gap: 3,
        }}
      >
        {apps.map((app, index) => (
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }} key={`${app.bundleId}-${index}`}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar
                  src={app.icon}
                  sx={{ width: 56, height: 56, mr: 2, bgcolor: 'primary.main' }}
                >
                  <AppleIcon />
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    component="div"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {app.name || 'Unknown App'}
                  </Typography>
                  {app.version && (
                    <Chip
                      label={`v${app.version}`}
                      size="small"
                      sx={{ mt: 0.5 }}
                    />
                  )}
                </Box>
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {app.bundleId || 'No Bundle ID'}
              </Typography>
            </CardContent>

            <CardActions>
              <ButtonGroup fullWidth variant="contained">
                <Button
                  startIcon={
                    downloadingId === app.bundleId ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <DownloadIcon />
                    )
                  }
                  onClick={() => handleDownload(app.bundleId)}
                  disabled={!app.bundleId || downloadingId === app.bundleId}
                  sx={{ flex: 1 }}
                >
                  {downloadingId === app.bundleId ? 'Downloading...' : 'Download'}
                </Button>
                <Button
                  startIcon={<InstallMobileIcon />}
                  onClick={() => handleInstall(app.bundleId, app.name)}
                  disabled={!app.bundleId || downloadingId === app.bundleId}
                  color={isHttps ? 'primary' : 'secondary'}
                  sx={{ flex: 1 }}
                >
                  Install
                </Button>
              </ButtonGroup>
            </CardActions>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default AppList;
