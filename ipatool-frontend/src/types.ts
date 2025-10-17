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

export interface AuthResponse {
  success: boolean;
  requiresTwoFactor?: boolean;
  sessionToken?: string;
  message?: string;
  error?: string;
}

export interface SearchResponse {
  success: boolean;
  apps: App[];
  error?: string;
}
