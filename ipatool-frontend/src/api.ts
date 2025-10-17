import axios from 'axios';
import { AuthCredentials, AuthResponse, SearchResponse } from './types';

const API_BASE_URL = 'http://localhost:3001/api';

export const api = {
  async login(credentials: AuthCredentials): Promise<AuthResponse> {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, credentials);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  },

  async search(query: string, email: string, password: string): Promise<SearchResponse> {
    try {
      const response = await axios.post(`${API_BASE_URL}/search`, {
        query,
        email,
        password
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        apps: [],
        error: error.response?.data?.error || 'Search failed'
      };
    }
  },

  async download(bundleId: string, email: string, password: string): Promise<Blob> {
    const response = await axios.post(
      `${API_BASE_URL}/download`,
      { bundleId, email, password },
      { responseType: 'blob' }
    );
    return response.data;
  }
};
