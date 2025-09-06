# Chatterbox TTS Authentication System

## Overview

The Chatterbox TTS web UI now includes a comprehensive user authentication and management system with the following features:

### User Authentication
- **Login/Signup**: Users can create accounts and log in to access the TTS system
- **Session Management**: Secure session handling with JWT tokens
- **Role-Based Access**: Support for regular users and administrators

### User Features
- **Personal Sessions**: Each user has their own isolated sessions and saved voices
- **Storage Limits**: Per-user limits for:
  - Maximum number of sessions
  - Maximum saved voices
  - Maximum audio generation minutes
- **Usage Tracking**: Real-time tracking of resource usage
- **Profile Management**: Users can view their usage statistics and account details

### Admin Features
- **User Management**: Admins can view, edit, and delete user accounts
- **System Settings**: Configure global limits and settings
- **Storage Management**: Monitor and manage system-wide storage usage
- **Usage Analytics**: View aggregate usage statistics

## Development Login Credentials

For development, use these mock credentials:

**Admin Account:**
- Email: admin@example.com
- Password: admin123

**Regular User Account:**
- Email: user@example.com
- Password: user123

## File Storage

User data is isolated and stored with user-specific keys:
- Sessions: `sessions_{userId}`
- Voices: `savedVoices_{userId}`
- Settings: `userSettings_{userId}`

## Components

### Authentication Components
- **AuthContext**: Provides authentication state and methods throughout the app
- **LoginForm**: Handles user login and registration
- **UserMenu**: Dropdown menu for user profile and logout

### Admin Components
- **AdminSettings**: Comprehensive admin panel with tabs for:
  - User management
  - System configuration
  - Storage management

### API Integration
- **authAPI**: Authentication API client with methods for:
  - Login/signup
  - Profile management
  - User administration (admin only)
- **mockAuth**: Development mock authentication for testing

## Usage

1. **First Time Setup**: Users will be redirected to the login page
2. **Create Account**: New users can sign up with email and password
3. **Access Control**: After login, users have access to their personal TTS workspace
4. **Admin Access**: Admin users can access the admin panel via the user menu

## Security Notes

- Passwords must be at least 8 characters long
- Sessions expire after inactivity
- User data is isolated by user ID
- Admin actions are restricted to admin role only

## Production Deployment

For production deployment:
1. Replace the mock authentication with real API endpoints
2. Implement proper JWT token validation
3. Set up a secure backend authentication service
4. Configure HTTPS for all authentication requests
5. Implement email verification for new accounts (optional)