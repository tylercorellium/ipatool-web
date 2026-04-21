import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import AppleIcon from '@mui/icons-material/Apple';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Download } from '../types';
import { api, BACKEND_BASE_URL } from '../api';

function relative(ts: number) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function bytes(n: number | null) {
  if (!n) return '';
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

interface Props {
  isHttps: boolean;
}

export default function DownloadHistory({ isHttps }: Props) {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Download | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.listDownloads();
      setDownloads(resp.downloads);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleInstall = (d: Download) => {
    if (!d.manifestUrl) return;
    const manifestUrl = `${BACKEND_BASE_URL}${d.manifestUrl}`;
    window.location.href = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
  };

  const handleDownload = (d: Download) => {
    if (!d.downloadUrl) return;
    window.location.href = `${BACKEND_BASE_URL}${d.downloadUrl}`;
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteDownload(confirmDelete.id);
      setConfirmDelete(null);
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (downloads.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AppleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No downloads yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Downloaded apps for this account will show up here.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        {downloads.map((d) => {
          const title = d.appName || d.bundleId;
          return (
            <Paper key={d.id} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {title}
                    </Typography>
                    {d.version && <Chip label={`v${d.version}`} size="small" />}
                    {!d.fileExists && (
                      <Chip
                        icon={<WarningAmberIcon />}
                        label="file missing"
                        size="small"
                        color="warning"
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {d.bundleId} · {bytes(d.size)} · {relative(d.downloadedAt)}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  {d.fileExists && isHttps && (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<InstallMobileIcon />}
                      onClick={() => handleInstall(d)}
                    >
                      Install
                    </Button>
                  )}
                  {d.fileExists && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => handleDownload(d)}
                    >
                      Download
                    </Button>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => setConfirmDelete(d)}
                    aria-label="delete from history"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            </Paper>
          );
        })}
      </Stack>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete from history?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{confirmDelete?.appName || confirmDelete?.bundleId}</strong> from
            your history?
            {confirmDelete?.fileExists && ' This also deletes the downloaded .ipa file.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
