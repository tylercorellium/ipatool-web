export interface App {
  name: string;
  bundleId: string;
  version: string;
  icon?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
  code?: string;
}

export interface Account {
  id: string;
  email: string;
  hasDownloadBundle?: boolean;
}

export interface AuthResponse {
  success: boolean;
  requiresTwoFactor?: boolean;
  sessionToken?: string;
  message?: string;
  error?: string;
  account?: Account;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  account?: Account;
}

export interface SearchResponse {
  success: boolean;
  apps: App[];
  error?: string;
}
