import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

type AuthState = {
  token: string | null;
  email: string | null;
};

type AuthContextValue = {
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem('token'),
    email: localStorage.getItem('email')
  }));

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    const token = res.data.token as string;
    localStorage.setItem('token', token);
    localStorage.setItem('email', email);
    setAuth({ token, email });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    setAuth({ token: null, email: null });
  };

  // verify token presence on load
  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    if (token) setAuth({ token, email });
  }, []);

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
