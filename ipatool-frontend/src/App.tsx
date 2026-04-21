import React, { useState, useEffect } from 'react';
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
import SecurityIcon from '@mui/icons-material/Security';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoginForm from './components/LoginForm';
import SearchBar from './components/SearchBar';
import AppList from './components/AppList';
import AccountMenu from './components/AccountMenu';
import AccountsManager from './components/AccountsManager';
import { api, BACKEND_BASE_URL } from './api';
import { App as AppType, AuthCredentials, Account } from './types';

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
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credentials, setCredentials] = useState<AuthCredentials | null>(null);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<AppType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isHttps, setIsHttps] = useState(window.location.protocol === 'https:');
  const [isIOS, setIsIOS] = useState(false);
  const [isChrome, setIsChrome] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);

  console.log('[App] Component state:', { isAuthenticated, isLoading, requiresTwoFactor, hasError: !!error });

  // Detect iOS and Chrome
  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(userAgent);
    const chrome = /crios|chrome/.test(userAgent) && !/edg/.test(userAgent);
    setIsIOS(iOS);
    setIsChrome(chrome);
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log('[App] Checking existing authentication...');
      const status = await api.checkAuthStatus();
      if (status.authenticated) {
        console.log('[App] User already authenticated, skipping login');
        setIsAuthenticated(true);
        if (status.account) setAccount(status.account);
        // Set dummy credentials since we don't need them for search/download
        setCredentials({ email: '', password: '' });
        refreshAccounts();
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);

  const refreshAccounts = async () => {
    try {
      const resp = await api.listAccounts();
      setAccounts(resp.accounts);
      const active = resp.accounts.find((a) => a.active);
      if (active) setAccount(active);
    } catch (err: any) {
      console.error('[App] Failed to load accounts:', err.message);
    }
  };

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
        if (response.account) setAccount(response.account);
        setCredentials(creds);
        setRequiresTwoFactor(false);
        setAddingAccount(false);
        setPrefillEmail(undefined);
        setApps([]);
        refreshAccounts();
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

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* clearing local state is enough */ }
    setIsAuthenticated(false);
    setAccount(null);
    setAccounts([]);
    setCredentials(null);
    setRequiresTwoFactor(false);
    setAddingAccount(false);
    setPrefillEmail(undefined);
    setApps([]);
    setError(null);
  };

  const handleSwitchAccount = async (id: string) => {
    try {
      setError(null);
      const resp = await api.switchAccount(id);
      setApps([]);
      if (resp.authenticated) {
        setAccount(resp.account);
        setIsAuthenticated(true);
        setAddingAccount(false);
        refreshAccounts();
      } else {
        // Keychain for this account expired — prefill login form.
        setAccount(resp.account);
        setPrefillEmail(resp.account.email);
        setAddingAccount(true);
        setIsAuthenticated(true); // stay in authed shell so menu is visible
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Switch failed');
    }
  };

  const handleAddAccount = () => {
    setAddingAccount(true);
    setPrefillEmail(undefined);
    setRequiresTwoFactor(false);
    setError(null);
  };

  const handleCancelAdd = () => {
    setAddingAccount(false);
    setPrefillEmail(undefined);
    setRequiresTwoFactor(false);
    setError(null);
  };

  const handleAccountsChanged = async () => {
    await refreshAccounts();
    // If the active account was deleted, server clears the cookie — reflect.
    const status = await api.checkAuthStatus();
    if (!status.authenticated) {
      setIsAuthenticated(false);
      setAccount(null);
      setAccounts([]);
    } else if (status.account) {
      setAccount(status.account);
    }
  };

  const handleDownloadBundle = async () => {
    try {
      const blob = await api.downloadBundle();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'downloadme.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Bundle download failed');
    }
  };

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    setError(null);

    try {
      const response = await api.search(query);

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
    try {
      const blob = await api.download(bundleId);

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
            {isAuthenticated && account?.hasDownloadBundle && (
              <Button
                color="inherit"
                startIcon={<FolderZipIcon />}
                onClick={handleDownloadBundle}
                sx={{ mr: 1 }}
              >
                Bundle
              </Button>
            )}
            {isAuthenticated && (
              <AccountMenu
                activeAccount={account}
                accounts={accounts}
                onSwitch={handleSwitchAccount}
                onAddAccount={handleAddAccount}
                onManage={() => setManageOpen(true)}
                onLogout={handleLogout}
              />
            )}
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          {/* Show certificate download for iOS users on HTTPS, even before login */}
          {isHttps && !isCheckingAuth && (
            <Alert severity={isIOS && isChrome ? "warning" : "info"} sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 250 }}>
                  <Typography variant="body2" fontWeight="bold">
                    📱 SSL Certificate Setup
                  </Typography>
                  <Typography variant="body2">
                    {isAuthenticated
                      ? 'To install apps directly on your iOS device, trust the SSL certificate first.'
                      : 'Install the SSL certificate to enable secure access and OTA installation.'}
                  </Typography>
                  {isIOS && isChrome && (
                    <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                      ⚠️ You're using Chrome. Please open this page in <strong>Safari</strong> to install the certificate.
                      Chrome cannot install iOS certificates.
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="contained"
                  startIcon={<SecurityIcon />}
                  size="small"
                  href={`${BACKEND_BASE_URL}/ssl/cert.pem`}
                  target="_blank"
                  disabled={isIOS && isChrome}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Download Certificate
                </Button>
              </Box>
            </Alert>
          )}

          {isCheckingAuth ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Checking authentication...</Typography>
            </Box>
          ) : !isAuthenticated ? (
            <LoginForm
              onLogin={handleLogin}
              requiresTwoFactor={requiresTwoFactor}
              isLoading={isLoading}
              error={error}
            />
          ) : addingAccount ? (
            <Box>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={handleCancelAdd}
                sx={{ mb: 2 }}
              >
                Back to {account ? (account.nickname || account.email) : 'account'}
              </Button>
              <Typography variant="h5" gutterBottom>
                {prefillEmail ? 'Sign in again' : 'Add another account'}
              </Typography>
              {prefillEmail && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  This account's session expired. Enter the password to re-authenticate.
                </Typography>
              )}
              <LoginForm
                onLogin={handleLogin}
                requiresTwoFactor={requiresTwoFactor}
                isLoading={isLoading}
                error={error}
                prefillEmail={prefillEmail}
              />
            </Box>
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

        <AccountsManager
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          onChanged={handleAccountsChanged}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;
