import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '@/lib/authApi';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: Date;
  storage: {
    maxSessions: number;
    maxVoices: number;
    maxAudioMinutes: number;
    usedSessions: number;
    usedVoices: number;
    usedAudioMinutes: number;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const checkAuth = async () => {
      try {
        // Bypass auth in development if enabled
        if (import.meta.env.VITE_BYPASS_AUTH === 'true') {
          setUser({
            id: '1',
            email: 'dev@example.com',
            name: 'Developer',
            role: 'admin',
            createdAt: new Date(),
            storage: {
              maxSessions: 100,
              maxVoices: 100,
              maxAudioMinutes: 1000,
              usedSessions: 0,
              usedVoices: 0,
              usedAudioMinutes: 0,
            },
          });
          localStorage.setItem('currentUserId', '1');
        } else {
          const token = localStorage.getItem('authToken');
          if (token) {
            const userData = await authAPI.getCurrentUser();
            setUser(userData);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('authToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { user, token } = await authAPI.login(email, password);
      localStorage.setItem('authToken', token);
      setUser(user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    try {
      const { user, token } = await authAPI.signup(email, password, name);
      localStorage.setItem('authToken', token);
      setUser(user);
    } catch (error) {
      console.error('Signup failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    try {
      const updatedUser = await authAPI.updateProfile(updates);
      setUser(updatedUser);
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}