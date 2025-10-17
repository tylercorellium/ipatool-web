import axios from 'axios';
import { AuthCredentials, AuthResponse, SearchResponse } from './types';

// Use environment variable or default to localhost
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

console.log('[API] Using backend URL:', API_BASE_URL);

export const api = {
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

  async search(query: string, email: string, password: string): Promise<SearchResponse> {
    console.log('[API] Searching for:', query);
    try {
      const response = await axios.post(`${API_BASE_URL}/search`, {
        query,
        email,
        password
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

  async download(bundleId: string, email: string, password: string): Promise<Blob> {
    console.log('[API] Downloading app:', bundleId);
    const response = await axios.post(
      `${API_BASE_URL}/download`,
      { bundleId, email, password },
      { responseType: 'blob' }
    );
    console.log('[API] Download complete');
    return response.data;
  }
};
