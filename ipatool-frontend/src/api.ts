import axios from 'axios';
import { AuthCredentials, AuthResponse, SearchResponse } from './types';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const ensureApiSuffix = (value: string) => {
  const normalised = stripTrailingSlash(value);
  return normalised.endsWith('/api') ? normalised : `${normalised}/api`;
};

const normaliseEnvApiUrl = (value: string) => {
  let apiUrl = ensureApiSuffix(value.trim());

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    apiUrl.startsWith('http://')
  ) {
    const upgraded = apiUrl.replace(/^http:\/\//, 'https://');
    console.warn(
      `[API] Detected HTTPS frontend with HTTP backend URL (${apiUrl}). ` +
        'Upgrading to HTTPS to avoid mixed-content errors.'
    );
    apiUrl = upgraded;
  }

  return stripTrailingSlash(apiUrl);
};

const resolveBackendBaseUrl = () => {
  const envApiUrl = process.env.REACT_APP_API_URL;

  if (envApiUrl) {
    const normalisedApi = normaliseEnvApiUrl(envApiUrl);
    console.log('[API] Using configured API URL:', normalisedApi);
    return normalisedApi.replace(/\/api$/, '');
  }

  const protocol =
    process.env.REACT_APP_BACKEND_PROTOCOL ||
    (typeof window !== 'undefined' ? window.location.protocol : 'http:');
  const hostname =
    process.env.REACT_APP_BACKEND_HOST ||
    (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const port = process.env.REACT_APP_BACKEND_PORT || '3001';

  const defaultPort = protocol === 'https:' ? '443' : '80';
  const portSegment = port && port !== defaultPort ? `:${port}` : '';

  const backendUrl = `${protocol}//${hostname}${portSegment}`;

  // Warn if frontend is on a different port than expected
  if (typeof window !== 'undefined') {
    const frontendPort = window.location.port;
    if (frontendPort && frontendPort !== port && !process.env.REACT_APP_BACKEND_PORT) {
      console.warn(
        `[API] Frontend is running on port ${frontendPort}, but backend auto-discovery ` +
        `defaulted to port ${port}. If authentication fails, set REACT_APP_BACKEND_PORT ` +
        `environment variable to the correct backend port.`
      );
    }
  }

  console.log('[API] Auto-discovered backend URL:', backendUrl);
  return backendUrl;
};

const resolvedApiBase =
  process.env.REACT_APP_API_URL &&
  normaliseEnvApiUrl(process.env.REACT_APP_API_URL);

export const BACKEND_BASE_URL = resolvedApiBase
  ? resolvedApiBase.replace(/\/api$/, '')
  : resolveBackendBaseUrl();

export const API_BASE_URL = resolvedApiBase || `${BACKEND_BASE_URL}/api`;

console.log('[API] Using backend URL:', API_BASE_URL);

export const api = {
  async checkAuthStatus(): Promise<{ authenticated: boolean }> {
    console.log('[API] Checking authentication status...');
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/status`);
      console.log('[API] Auth status:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[API] Auth status check error:', error.message);
      return { authenticated: false };
    }
  },

  async login(credentials: AuthCredentials): Promise<AuthResponse> {
    console.log('[API] Attempting login with email:', credentials.email.substring(0, 3) + '***');
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, credentials);
      console.log('[API] Login response:', { success: response.data.success, requiresTwoFactor: response.data.requiresTwoFactor });
      return response.data;
    } catch (error: any) {
      console.error('[API] Login error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.details || 'Login failed'
      };
    }
  },

  async search(query: string): Promise<SearchResponse> {
    console.log('[API] Searching for:', query);
    try {
      const response = await axios.post(`${API_BASE_URL}/search`, {
        query
      });
      console.log('[API] Search response:', response.data.apps?.length || 0, 'apps found');
      return response.data;
    } catch (error: any) {
      console.error('[API] Search error:', error.response?.data || error.message);
      return {
        success: false,
        apps: [],
        error: error.response?.data?.error || error.response?.data?.details || 'Search failed'
      };
    }
  },

  async download(bundleId: string): Promise<Blob> {
    console.log('[API] Downloading app:', bundleId);
    const response = await axios.post(
      `${API_BASE_URL}/download`,
      { bundleId },
      { responseType: 'blob' }
    );
    console.log('[API] Download complete');
    return response.data;
  }
};
