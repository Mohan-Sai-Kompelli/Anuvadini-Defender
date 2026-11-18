import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, type User } from './services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, role: 'student') => Promise<{ success: boolean; error?: string; data?: any }>;
  studentLogin: (uid: string, password: string) => Promise<{ success: boolean; error?: string; data?: any }>;
  register: (email: string, password: string, name: string, role: 'student') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  setOrganization: (organization: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();

    const { DeviceEventEmitter } = require('react-native');
    const authSub = DeviceEventEmitter.addListener('auth:unauthorized', () => {
      console.log('AuthContext: Received global auth:unauthorized event, logging user out');
      setUser(null);
    });

    return () => {
      authSub.remove();
    };
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');

      if (storedUser) {
        const userData = JSON.parse(storedUser) as User;
        setUser(userData);
        // Validate the token against /auth/me in the BACKGROUND instead of
        // awaiting it here. This used to hold the splash screen up for the
        // full network round-trip (slow on a cold/flaky connection — the
        // exact "splash screen bahut time leti hai" complaint), even though
        // the cached user is already good enough to show MainApp
        // immediately (optimistic session, same idea as the WatermelonDB
        // cache-then-refresh work elsewhere in the app). If the token turns
        // out to be genuinely invalid, validateSessionInBackground() calls
        // logout() itself — same end state, just not blocking on it first.
        validateSessionInBackground(userData);
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      // If there's an error, clear stored data and force re-login
      await logout();
    } finally {
      setIsLoading(false);
    }
  };

  const validateSessionInBackground = async (userData: User) => {
    try {
      // Check if token is still valid by calling /auth/me
      // For student tokens, the server returns { success: true, organization: ... }
      // which means success=true is enough to confirm the token is valid.
      // We skip trying to re-hydrate user fields from /auth/me since student
      // tokens don't return student profile data from that endpoint.
      const authResponse = await apiService.checkAuthStatus();
      if (!authResponse.success) {
        // `success: false` covers a genuine expired/invalid token, but ALSO a
        // network error, a request timeout, or a transient 5xx at the exact
        // moment the app opens (cold network, server restart, DNS blip) —
        // none of which mean the session actually ended. Only log out for
        // codes the server explicitly marks as a real auth/session failure
        // (mirrors the opt-in list in services/api.ts's own 401/403 handling);
        // anything else keeps the cached session, so a flaky connection at
        // startup doesn't silently sign the user out.
        const genuineAuthFailureCodes = [
          'no_token',
          'invalid_token',
          'token_expired',
          'account_deactivated',
          'session_terminated',
          'session_expired',
          'session_required',
        ];
        if (authResponse.code && genuineAuthFailureCodes.includes(authResponse.code)) {
          await logout();
        }
        return;
      }

      // Token is valid — keep the stored user data as-is.
      // If the response has richer student fields (id/fullName/uid), update;
      // otherwise leave the existing AsyncStorage user untouched.
      if (authResponse.data && (authResponse.data as any).id) {
        const serverData = authResponse.data as any;
        const freshUserData: User = {
          id: serverData.id,
          name: serverData.fullName || serverData.name || userData.name,
          uid: serverData.uid || userData.uid,
          role: 'student'
        };

        setUser(freshUserData);
        await AsyncStorage.setItem('user', JSON.stringify(freshUserData));

        if (serverData.organization) {
          await AsyncStorage.setItem('studentData', JSON.stringify(serverData));
          await AsyncStorage.setItem('organizationData', JSON.stringify(serverData.organization));
        }
      }
    } catch (error) {
      console.error('Background session validation failed:', error);
    }
  };

  const login = async (email: string, password: string, role: 'student'): Promise<{ success: boolean; error?: string; data?: any }> => {
    try {
      setIsLoading(true);
      // console.log('Attempting login with:', { email, role });
      
      const response = await apiService.login(email, password);
      // console.log('Login response:', response);
      
      if (response.success && response.data) {
        // Extract token from various possible locations
        let token = '';
        if (response.data.token && response.data.token !== '') {
          token = response.data.token;
        } else if (response.data.accessToken && response.data.accessToken !== '') {
          token = response.data.accessToken;
        } else if (response.data.data?.token && response.data.data.token !== '') {
          token = response.data.data.token;
        } else if (response.data.data?.accessToken && response.data.data.accessToken !== '') {
          token = response.data.data.accessToken;
        }
        if (token) {
          await AsyncStorage.setItem('authToken', token);
          // console.log('Auth token stored in AsyncStorage:', token);
        } else {
          // console.warn('No auth token found in login response');
        }
        
        setUser(response.data.user);
        
        return { success: true, data: response.data };
      } else {
        console.error('Login failed:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      setIsLoading(false);
    }
  };

  const studentLogin = async (uid: string, password: string): Promise<{ success: boolean; error?: string; data?: any }> => {
    try {
      console.log('Attempting student login with UID:', uid);
      
      const response = await apiService.studentLogin(uid, password);
      console.log('Student login response:', response);
      
      if (response.success && response.data) {
        // Extract token from various possible locations
        let token = '';
        if (response.data.token && response.data.token !== '') {
          token = response.data.token;
        } else if (response.data.accessToken && response.data.accessToken !== '') {
          token = response.data.accessToken;
        } else if (response.data.data?.token && response.data.data.token !== '') {
          token = response.data.data.token;
        } else if (response.data.data?.accessToken && response.data.data.accessToken !== '') {
          token = response.data.data.accessToken;
        }
        if (token) {
          await AsyncStorage.setItem('authToken', token);
          console.log('Auth token stored in AsyncStorage:', token);
        } else {
          console.warn('No auth token found in student login response');
        }
        
        setUser(response.data.user);
        
        return { success: true, data: response.data };
      } else {
        console.error('Student login failed:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Student login error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const register = async (email: string, password: string, name: string, role: 'student'): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      
      const response = await apiService.register(email, password, name);
      
      if (response.success && response.data) {
        // Extract token from various possible locations
        let token = '';
        if (response.data.token && response.data.token !== '') {
          token = response.data.token;
        } else if (response.data.accessToken && response.data.accessToken !== '') {
          token = response.data.accessToken;
        } else if (response.data.data?.token && response.data.data.token !== '') {
          token = response.data.data.token;
        } else if (response.data.data?.accessToken && response.data.data.accessToken !== '') {
          token = response.data.data.accessToken;
        }
        if (token) {
          await AsyncStorage.setItem('authToken', token);
          // console.log('Auth token stored in AsyncStorage:', token);
        } else {
          console.warn('No auth token found in registration response');
        }
        setUser(response.data.user);
        return { success: true };
      } else {
        console.error('Registration failed:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setUser(null);
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
    }
  };

  const setOrganization = (organization: any) => {
    // This function can be used to store organization data in context if needed
    console.log('Organization set:', organization);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    studentLogin,
    register,
    logout,
    isAuthenticated: !!user,
    setOrganization,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 