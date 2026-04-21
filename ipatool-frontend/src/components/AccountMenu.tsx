import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Typography,
  Box,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { Account } from '../types';

interface Props {
  activeAccount: Account | null;
  accounts: Account[];
  onSwitch: (id: string) => void;
  onAddAccount: () => void;
  onManage: () => void;
  onLogout: () => void;
}

function accountLabel(a: Account) {
  return a.nickname?.trim() || a.email;
}

export default function AccountMenu({
  activeAccount,
  accounts,
  onSwitch,
  onAddAccount,
  onManage,
  onLogout,
}: Props) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  const others = accounts.filter((a) => a.id !== activeAccount?.id);

  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<PersonIcon />}
        endIcon={<ArrowDropDownIcon />}
        sx={{ textTransform: 'none' }}
      >
        <Box sx={{ textAlign: 'left', lineHeight: 1.2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {activeAccount ? accountLabel(activeAccount) : 'No account'}
          </Typography>
          {activeAccount?.nickname && (
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {activeAccount.email}
            </Typography>
          )}
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {activeAccount && (
          <MenuItem disabled sx={{ opacity: '1 !important' }}>
            <ListItemIcon>
              <CheckIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText
              primary={accountLabel(activeAccount)}
              secondary={activeAccount.nickname ? activeAccount.email : null}
            />
            <Chip label="active" size="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}

        {others.length > 0 && <Divider />}
        {others.map((a) => (
          <MenuItem
            key={a.id}
            onClick={() => {
              setAnchor(null);
              onSwitch(a.id);
            }}
          >
            <ListItemIcon>
              <PersonIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={accountLabel(a)}
              secondary={a.nickname ? a.email : null}
            />
          </MenuItem>
        ))}

        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onAddAccount();
          }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add another account" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onManage();
          }}
        >
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Manage accounts" />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onLogout();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Log out" />
        </MenuItem>
      </Menu>
    </>
  );
}
