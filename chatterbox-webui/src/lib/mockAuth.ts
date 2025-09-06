// Mock authentication for development
// In production, this would be replaced with real API calls

import type { User } from '@/contexts/AuthContext';

const MOCK_USERS: Record<string, { password: string; user: User }> = {
  'admin@example.com': {
    password: 'admin123',
    user: {
      id: '1',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      createdAt: new Date('2024-01-01'),
      storage: {
        maxSessions: 100,
        maxVoices: 100,
        maxAudioMinutes: 1000,
        usedSessions: 5,
        usedVoices: 10,
        usedAudioMinutes: 45.5,
      },
    },
  },
  'user@example.com': {
    password: 'user123',
    user: {
      id: '2',
      email: 'user@example.com',
      name: 'Regular User',
      role: 'user',
      createdAt: new Date('2024-01-15'),
      storage: {
        maxSessions: 10,
        maxVoices: 20,
        maxAudioMinutes: 60,
        usedSessions: 3,
        usedVoices: 5,
        usedAudioMinutes: 15.2,
      },
    },
  },
};

let currentUser: User | null = null;

// Override the real auth API in development
if (import.meta.env.DEV) {
  const authAPI = {
    async login(email: string, password: string): Promise<{ user: User; token: string }> {
      const mockUser = MOCK_USERS[email];
      if (!mockUser || mockUser.password !== password) {
        throw new Error('Invalid email or password');
      }
      
      currentUser = mockUser.user;
      const token = btoa(`${email}:${Date.now()}`);
      return { user: mockUser.user, token };
    },

    async signup(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
      if (MOCK_USERS[email]) {
        throw new Error('User already exists');
      }
      
      const newUser: User = {
        id: String(Object.keys(MOCK_USERS).length + 1),
        email,
        name,
        role: 'user',
        createdAt: new Date(),
        storage: {
          maxSessions: 10,
          maxVoices: 20,
          maxAudioMinutes: 60,
          usedSessions: 0,
          usedVoices: 0,
          usedAudioMinutes: 0,
        },
      };
      
      MOCK_USERS[email] = { password, user: newUser };
      currentUser = newUser;
      const token = btoa(`${email}:${Date.now()}`);
      return { user: newUser, token };
    },

    async logout(): Promise<void> {
      currentUser = null;
    },

    async getCurrentUser(): Promise<User> {
      if (!currentUser) {
        throw new Error('Not authenticated');
      }
      return currentUser;
    },

    async updateProfile(updates: Partial<User>): Promise<User> {
      if (!currentUser) {
        throw new Error('Not authenticated');
      }
      currentUser = { ...currentUser, ...updates };
      return currentUser;
    },

    async getAllUsers(): Promise<User[]> {
      return Object.values(MOCK_USERS).map(m => m.user);
    },

    async updateUser(userId: string, updates: Partial<User>): Promise<User> {
      const userEntry = Object.values(MOCK_USERS).find(m => m.user.id === userId);
      if (!userEntry) {
        throw new Error('User not found');
      }
      userEntry.user = { ...userEntry.user, ...updates };
      return userEntry.user;
    },

    async deleteUser(userId: string): Promise<void> {
      const email = Object.keys(MOCK_USERS).find(
        email => MOCK_USERS[email].user.id === userId
      );
      if (email) {
        delete MOCK_USERS[email];
      }
    },
  };

  // Replace the real authAPI export
  (window as any).__mockAuthAPI = authAPI;
}