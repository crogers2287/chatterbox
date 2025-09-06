import axios from 'axios';
import type { User } from '@/contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:6093';

const authClient = axios.create({
  baseURL: `${API_BASE_URL}/auth`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
authClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
authClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Import mock auth for development
import './mockAuth';

// Use mock API in development, real API in production
export const authAPI = import.meta.env.DEV && (window as any).__mockAuthAPI ? (window as any).__mockAuthAPI : {
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const response = await authClient.post('/login', { email, password });
    return response.data;
  },

  async signup(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const response = await authClient.post('/signup', { email, password, name });
    return response.data;
  },

  async logout(): Promise<void> {
    await authClient.post('/logout');
  },

  async getCurrentUser(): Promise<User> {
    const response = await authClient.get('/me');
    return response.data;
  },

  async updateProfile(updates: Partial<User>): Promise<User> {
    const response = await authClient.patch('/me', updates);
    return response.data;
  },

  async getAllUsers(): Promise<User[]> {
    const response = await authClient.get('/users');
    return response.data;
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const response = await authClient.patch(`/users/${userId}`, updates);
    return response.data;
  },

  async deleteUser(userId: string): Promise<void> {
    await authClient.delete(`/users/${userId}`);
  },
};