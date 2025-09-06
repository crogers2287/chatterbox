import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { authAPI } from '@/lib/authApi';
import { 
  Users, 
  Settings, 
  Database, 
  Shield, 
  Trash2, 
  Edit, 
  Save,
  X,
  UserCog
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SystemSettings {
  maxSessionsPerUser: number;
  maxVoicesPerUser: number;
  maxAudioMinutesPerUser: number;
  allowSignups: boolean;
  requireEmailVerification: boolean;
  maxConcurrentGenerations: number;
  defaultSpeechRate: number;
  maxTextLength: number;
}

export function AdminSettings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    maxSessionsPerUser: 10,
    maxVoicesPerUser: 20,
    maxAudioMinutesPerUser: 60,
    allowSignups: true,
    requireEmailVerification: false,
    maxConcurrentGenerations: 3,
    defaultSpeechRate: 1.0,
    maxTextLength: 5000,
  });
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadUsers();
      loadSettings();
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      const userList = await authAPI.getAllUsers();
      setUsers(userList);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadSettings = async () => {
    // Load settings from localStorage or API
    const savedSettings = localStorage.getItem('systemSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      // Save to localStorage for now (would be API call in production)
      localStorage.setItem('systemSettings', JSON.stringify(settings));
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = async () => {
    if (!editingUser) return;
    
    setIsLoading(true);
    try {
      await authAPI.updateUser(editingUser.id, editingUser);
      await loadUsers();
      setEditingUser(null);
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await authAPI.deleteUser(userId);
      await loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <Card>
          <CardContent className="p-6">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-center text-muted-foreground">
              Admin access required
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground">Manage users and system configuration</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="system">
            <Settings className="mr-2 h-4 w-4" />
            System
          </TabsTrigger>
          <TabsTrigger value="storage">
            <Database className="mr-2 h-4 w-4" />
            Storage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Role: {user.role} | Created: {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingUser(user)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteUser(user.id)}
                        disabled={user.id === user?.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Configure system-wide settings and limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maxSessions">Max Sessions per User</Label>
                  <Input
                    id="maxSessions"
                    type="number"
                    value={settings.maxSessionsPerUser}
                    onChange={(e) => setSettings({ ...settings, maxSessionsPerUser: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxVoices">Max Voices per User</Label>
                  <Input
                    id="maxVoices"
                    type="number"
                    value={settings.maxVoicesPerUser}
                    onChange={(e) => setSettings({ ...settings, maxVoicesPerUser: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxAudio">Max Audio Minutes per User</Label>
                  <Input
                    id="maxAudio"
                    type="number"
                    value={settings.maxAudioMinutesPerUser}
                    onChange={(e) => setSettings({ ...settings, maxAudioMinutesPerUser: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxConcurrent">Max Concurrent Generations</Label>
                  <Input
                    id="maxConcurrent"
                    type="number"
                    value={settings.maxConcurrentGenerations}
                    onChange={(e) => setSettings({ ...settings, maxConcurrentGenerations: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTextLength">Max Text Length</Label>
                  <Input
                    id="maxTextLength"
                    type="number"
                    value={settings.maxTextLength}
                    onChange={(e) => setSettings({ ...settings, maxTextLength: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultSpeechRate">Default Speech Rate</Label>
                  <Input
                    id="defaultSpeechRate"
                    type="number"
                    step="0.1"
                    value={settings.defaultSpeechRate}
                    onChange={(e) => setSettings({ ...settings, defaultSpeechRate: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allowSignups"
                    checked={settings.allowSignups}
                    onChange={(e) => setSettings({ ...settings, allowSignups: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="allowSignups">Allow new user signups</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requireEmail"
                    checked={settings.requireEmailVerification}
                    onChange={(e) => setSettings({ ...settings, requireEmailVerification: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="requireEmail">Require email verification</Label>
                </div>
              </div>

              <Button onClick={saveSettings} disabled={isLoading}>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle>Storage Management</CardTitle>
              <CardDescription>
                Monitor and manage storage usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium mb-2">Storage Overview</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Audio Files:</span>
                      <span className="font-medium">1,234</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Storage Used:</span>
                      <span className="font-medium">12.5 GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Sessions:</span>
                      <span className="font-medium">45</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saved Voices:</span>
                      <span className="font-medium">89</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Button variant="outline" className="w-full">
                    Clean Temporary Files
                  </Button>
                  <Button variant="outline" className="w-full">
                    Export Database Backup
                  </Button>
                  <Button variant="destructive" className="w-full">
                    Clear Old Audio Files (30+ days)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full p-2 border rounded"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Storage Limits</Label>
                <div className="grid gap-2">
                  <Input
                    type="number"
                    placeholder="Max Sessions"
                    value={editingUser.storage?.maxSessions || 10}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      storage: { ...editingUser.storage, maxSessions: parseInt(e.target.value) }
                    })}
                  />
                  <Input
                    type="number"
                    placeholder="Max Voices"
                    value={editingUser.storage?.maxVoices || 20}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      storage: { ...editingUser.storage, maxVoices: parseInt(e.target.value) }
                    })}
                  />
                  <Input
                    type="number"
                    placeholder="Max Audio Minutes"
                    value={editingUser.storage?.maxAudioMinutes || 60}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      storage: { ...editingUser.storage, maxAudioMinutes: parseInt(e.target.value) }
                    })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={updateUser} disabled={isLoading}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}