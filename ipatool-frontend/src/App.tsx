import React, { useState } from 'react';
import {
  Container,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  CircularProgress,
  Alert,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';
import AppleIcon from '@mui/icons-material/Apple';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginForm from './components/LoginForm';
import SearchBar from './components/SearchBar';
import AppList from './components/AppList';
import { api } from './api';
import { App as AppType, AuthCredentials } from './types';

const theme = createTheme({
  palette: {
    primary: {
      main: '#007AFF',
    },
    secondary: {
      main: '#5856D6',
    },
  },
});

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<AuthCredentials | null>(null);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<AppType[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  console.log('[App] Component state:', { isAuthenticated, isLoading, requiresTwoFactor, hasError: !!error });

  const handleLogin = async (creds: AuthCredentials) => {
    console.log('[App] handleLogin called');
    setIsLoading(true);
    setError(null);

    try {
      console.log('[App] Calling api.login...');
      const response = await api.login(creds);
      console.log('[App] api.login response:', response);

      if (response.success) {
        setIsAuthenticated(true);
        setCredentials(creds);
        setRequiresTwoFactor(false);
      } else if (response.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setCredentials(creds);
        setError('Please enter your two-factor authentication code');
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCredentials(null);
    setRequiresTwoFactor(false);
    setApps([]);
    setError(null);
  };

  const handleSearch = async (query: string) => {
    if (!credentials) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await api.search(query, credentials.email, credentials.password);

      if (response.success) {
        setApps(response.apps);
        if (response.apps.length === 0) {
          setError('No apps found for your search query');
        }
      } else {
        setError(response.error || 'Search failed');
        setApps([]);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during search');
      setApps([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (bundleId: string) => {
    if (!credentials) return;

    try {
      const blob = await api.download(bundleId, credentials.email, credentials.password);

      // Create a download link and trigger it
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${bundleId}.ipa`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Download failed');
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <AppleIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              ipatool-web
            </Typography>
            {isAuthenticated && (
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
                Logout
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          {!isAuthenticated ? (
            <LoginForm
              onLogin={handleLogin}
              requiresTwoFactor={requiresTwoFactor}
              isLoading={isLoading}
              error={error}
            />
          ) : (
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                Search iOS Apps
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Search for iOS applications and download .ipa files
              </Typography>

              <SearchBar onSearch={handleSearch} isLoading={isSearching} />

              {isSearching && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                  <CircularProgress />
                </Box>
              )}

              {error && !isSearching && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              {!isSearching && <AppList apps={apps} onDownload={handleDownload} />}
            </Box>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
