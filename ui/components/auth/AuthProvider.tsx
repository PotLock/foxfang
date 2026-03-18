'use client';

import { createContext, useContext, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User;
  login: (user: User) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const DEFAULT_USER: User = {
  id: 'local',
  email: 'user@foxfang.local',
  name: 'User',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const login = () => {};
  const logout = async () => {};

  return (
    <AuthContext.Provider value={{ user: DEFAULT_USER, login, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
