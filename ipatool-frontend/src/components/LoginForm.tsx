import React, { useState } from 'react';
import { TextField, Button, Box, Alert, CircularProgress, Typography, Paper } from '@mui/material';
import { AuthCredentials } from '../types';

interface LoginFormProps {
  onLogin: (credentials: AuthCredentials) => Promise<void>;
  requiresTwoFactor: boolean;
  isLoading: boolean;
  error: string | null;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin, requiresTwoFactor, isLoading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin({ email, password, code: code || undefined });
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 500, mx: 'auto', mt: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        iCloud Login
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        Sign in with your Apple ID to download iOS apps
      </Typography>

      <form onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            disabled={isLoading}
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            disabled={isLoading}
            autoComplete="current-password"
          />

          {requiresTwoFactor && (
            <TextField
              label="Two-Factor Authentication Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              fullWidth
              disabled={isLoading}
              placeholder="Enter 6-digit code"
              helperText="Enter the code sent to your trusted device"
            />
          )}

          {error && (
            <Alert severity="error">{error}</Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isLoading}
            sx={{ mt: 1 }}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
          </Button>

          <Typography variant="caption" color="text.secondary" align="center">
            Your credentials are never stored on our servers
          </Typography>
        </Box>
      </form>
    </Paper>
  );
};

export default LoginForm;
