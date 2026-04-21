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
  nickname?: string | null;
  hasDownloadBundle?: boolean;
  active?: boolean;
  lastUsedAt?: number;
  createdAt?: number;
  downloadCount?: number;
}

export interface AccountsResponse {
  accounts: Account[];
}

export interface SwitchAccountResponse {
  authenticated: boolean;
  account: Account;
}

export interface DeleteAccountResponse {
  success: boolean;
  deletedActive: boolean;
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
