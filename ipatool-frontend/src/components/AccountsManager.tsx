import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  Chip,
  Stack,
  Typography,
  Alert,
  CircularProgress,
  Box,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Account } from '../types';
import { api } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void; // parent re-fetches account list / active account
}

function formatRelative(ts?: number) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function AccountsManager({ open, onClose, onChanged }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNickname, setDraftNickname] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.listAccounts();
      setAccounts(resp.accounts);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const startEdit = (a: Account) => {
    setEditingId(a.id);
    setDraftNickname(a.nickname || '');
  };

  const commitRename = async (id: string) => {
    try {
      await api.renameAccount(id, draftNickname || null);
      setEditingId(null);
      await refresh();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Rename failed');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteAccount(confirmDelete.id);
      setConfirmDelete(null);
      await refresh();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Manage accounts</DialogTitle>
        <DialogContent dividers>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!loading && accounts.length === 0 && (
            <Typography color="text.secondary">No accounts yet.</Typography>
          )}
          <List disablePadding>
            {accounts.map((a) => (
              <ListItem
                key={a.id}
                divider
                alignItems="flex-start"
                sx={{ py: 1.5 }}
                secondaryAction={
                  editingId === a.id ? (
                    <Stack direction="row" spacing={0.5}>
                      <IconButton onClick={() => commitRename(a.id)} size="small">
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton onClick={() => setEditingId(null)} size="small">
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={0.5}>
                      <IconButton onClick={() => startEdit(a)} size="small" aria-label="rename">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton onClick={() => setConfirmDelete(a)} size="small" aria-label="delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )
                }
              >
                <ListItemText
                  primary={
                    editingId === a.id ? (
                      <TextField
                        autoFocus
                        size="small"
                        value={draftNickname}
                        onChange={(e) => setDraftNickname(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(a.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        placeholder="Nickname (optional)"
                        fullWidth
                      />
                    ) : (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontWeight={600}>
                          {a.nickname || a.email}
                        </Typography>
                        {a.active && <Chip label="active" size="small" color="primary" />}
                      </Stack>
                    )
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary" component="span">
                      {a.nickname ? `${a.email} · ` : ''}
                      {a.downloadCount ?? 0} downloads · last used {formatRelative(a.lastUsedAt)}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete account?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{confirmDelete?.nickname || confirmDelete?.email}</strong>?
            This deletes the stored login, downloaded IPAs, and any downloadme bundle for this account. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
