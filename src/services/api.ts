import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../config';
import { getPublicIp } from '../utils/publicIp';
import { collectDeviceTelemetry } from '../utils/deviceTelemetry';
import { resetLocalCache } from '../db';
import { saveProfile, saveOrganization, saveWfhStatus } from '../db/cache/profileCache';
import {
  saveLeaveRequests,
  saveFieldRequests,
  saveCheckoutRequests,
  getCachedLeaveRequests,
  getCachedFieldRequests,
  getCachedCheckoutRequests,
} from '../db/cache/requestsCache';
import {
  saveAttendanceRecords,
  saveAttendanceStats,
  getCachedAttendanceRecords,
  getCachedAttendanceStats,
} from '../db/cache/attendanceCache';
import {
  saveHolidays,
  getCachedHolidays,
  saveTimetableRows,
  getCachedTimetableRows,
  saveClassCheckinLog,
  getCachedClassCheckinLog,
} from '../db/cache/scheduleCache';
import {
  saveSpotCheckHistory,
  getCachedSpotCheckHistory,
  saveMemos,
  getCachedMemos,
  saveOutreachActivities,
  getCachedOutreachActivities,
} from '../db/cache/engagementCache';
import { isFresh, markSynced } from '../db/cache/syncMeta';

// TTL windows for the "skip the network call entirely if cache is fresh
// enough" layer. Chosen per-domain by how much staleness the screen can
// tolerate — NOT applied to anything security/correctness-sensitive: login,
// /auth/me (also validates the session token — see AuthContext), WFH status
// (gates the geofence check), and the spot-check *pending* poll (mandatory
// fraud-detection gate; must stay live) are deliberately left ungated.
const TTL = {
  leaveFieldCheckout: 2 * 60 * 1000,
  attendanceHistory: 2 * 60 * 1000,
  attendanceStats: 5 * 60 * 1000,
  holidays: 60 * 60 * 1000,
  timetable: 30 * 60 * 1000,
  dailyOperational: 3 * 60 * 1000, // class-checkin log
  spotCheckHistory: 5 * 60 * 1000,
  memos: 10 * 60 * 1000,
  outreach: 10 * 60 * 1000,
  calendar: 5 * 60 * 1000,
};

// Backend base URL is resolved at call time from the single source of truth in
// ../config (getApiBaseUrl), so a runtime host override takes effect immediately.

export interface User {
  id: string;
  email?: string;
  name: string;
  role: 'student';
  uid?: string;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  organizationId: string;
  faceData?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentLookupResponse {
  student: {
    id: string;
    fullName: string;
    uid: string;
    age: number;
    gender: string;
    class?: string;
    department?: string;
    bureau?: string;
    selectedBiometrics: {
      face: boolean;
      fingerprint: boolean;
      iris: boolean;
      palm: boolean;
      voice: boolean;
    };
    organization: {
      id: string;
      name: string;
      organizationType: string;
      selectedBiometrics: {
        face: boolean;
        fingerprint: boolean;
        iris: boolean;
        palm: boolean;
        voice: boolean;
      };
      location: {
        latitude: number;
        longitude: number;
      };
      address?: any;
    };
  };
}

export interface Attendance {
  id: string;
  studentId: string;
  type: 'in' | 'out';
  timestamp: string;
  latitude: number;
  longitude: number;
  distance: number;
  faceVerified: boolean;
  createdAt: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  accessToken?: string;
  user: User;
  message?: string;
  data?: {
    organization?: any;
    student?: any;
    token?: string;
    accessToken?: string;
  };
  organization?: any;
  student?: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  // On a failed request these carry the server's structured error body so
  // callers can react to a specific business outcome (e.g. the campus-geofence
  // rejection exposes `code`, `nearestOffice`, `distance`, `allowedRadius`).
  code?: string;
  details?: any;
}

// Leave/field/checkout list responses nest their array under different keys
// depending on the endpoint version (see RequestScreen.tsx's own candidate
// lists for the same problem) — this mirrors that "find the first array"
// fallback so the cache gets records regardless of which shape came back.
function extractRequestArray(payload: any, extraKeys: string[]): any[] {
  const candidates: any[] = [
    payload,
    payload?.data,
    ...extraKeys.map((k) => payload?.[k]),
    ...extraKeys.map((k) => payload?.data?.[k]),
  ];
  return (candidates.find(Array.isArray) as any[]) || [];
}

class ApiService {
  private async getAuthToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        return token;
      }

      const [shareRaw, trackingToken] = await Promise.all([
        AsyncStorage.getItem('liveTrackingShare'),
        AsyncStorage.getItem('liveTrackingAuthToken')
      ]);
      if (!trackingToken || !shareRaw) {
        return null;
      }

      try {
        const share = JSON.parse(shareRaw);
        const endsAt = share?.endsAt ? new Date(share.endsAt) : null;
        if (!share?.active || (endsAt && endsAt <= new Date())) {
          return null;
        }
        return trackingToken;
      } catch (parseError) {
        console.warn('Failed to parse liveTrackingShare token fallback:', parseError);
        return null;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  // Health check endpoint
  async healthCheck(): Promise<ApiResponse<{ status: string; message: string; timestamp: string }>> {
    return this.makeRequest('/health');
  }

  // Comprehensive token test function
  async testTokenFlow(): Promise<void> {
    try {
      console.log('=== Token Flow Test ===');
      
      // 1. Check stored token
      const token = await AsyncStorage.getItem('authToken');
      console.log('1. Stored token:', token ? 'EXISTS' : 'MISSING');
      
      // 2. Test token retrieval
      const retrievedToken = await this.getAuthToken();
      console.log('2. Retrieved token:', retrievedToken ? 'EXISTS' : 'MISSING');
      
      // 3. Test backend health first
      console.log('3. Testing backend health...');
      const healthResponse = await this.healthCheck();
      console.log('4. Health check response:', healthResponse);
      
      // 4. Test a simple authenticated request
      console.log('5. Testing authenticated request...');
      const testResponse = await this.makeRequest('/auth/me');
      console.log('6. Auth test response:', testResponse);
      
      // 5. Check if token is being sent in headers
      console.log('7. Token being sent:', retrievedToken ? 'YES' : 'NO');
      
      console.log('=== Token Flow Test Complete ===');
    } catch (error) {
      console.error('Token flow test error:', error);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit & { skipAuthClear?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const token = await this.getAuthToken();
      const url = `${getApiBaseUrl()}${endpoint}`;
      const skipAuthClear = Boolean((options as any)?.skipAuthClear);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      };

      if (token !== null && token !== '') {
        const trimmed = token.trim();
        const hasScheme = /^bearer\s+/i.test(trimmed) || /^jwt\s+/i.test(trimmed);
        headers.Authorization = hasScheme ? trimmed : `Bearer ${trimmed}`;
        console.log('Adding Authorization header with token (normalized)');
      } else {
        console.log('No token available for request');
      }

      console.log('Making API request to:', url);
      console.log('Request headers:', headers);

      // Abort a stalled request instead of hanging forever, so an upload that
      // can't reach the server fails fast with a clear message.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      console.log('Response status:', response.status);
      const contentType = response.headers?.get?.('content-type') || '';
      console.log('Response content-type:', contentType);

      let parsedData: any = null;
      let rawText: string | null = null;
      let isJson = /application\/json/i.test(contentType);
      if (isJson) {
        try {
          parsedData = await response.clone().json();
        } catch (e) {
          isJson = false;
        }
      }
      if (!isJson) {
        try {
          rawText = await response.text();
        } catch (e) {
          rawText = null;
        }
        console.warn('Non-JSON response body (first 200 chars):', rawText?.slice(0, 200));
      }

      if (!response.ok) {
        // Return the actual error message from backend
        const errorMessage = (parsedData?.message as string)
          || (parsedData?.error as string)
          || (rawText && !isJson ? rawText.slice(0, 200) : undefined)
          || `HTTP ${response.status}: ${response.statusText}`;
        // Expected business rejections (4xx — geofence, "already marked",
        // validation, not-found) are normal outcomes the UI already handles, not
        // crashes. Logging them via console.error tripped React Native's red
        // LogBox overlay in dev (e.g. the "outside campus office" geofence 400).
        // Reserve console.error for genuine server faults (5xx); warn for 4xx.
        if (response.status >= 500) {
          console.error('API Error at', url, ':', errorMessage);
        } else {
          console.warn('API request rejected at', url, ':', errorMessage);
        }

        // A 401/403 is EITHER a genuine auth failure (bad/expired JWT, deactivated
        // account, session invalidated elsewhere) OR a rejected business action
        // (face mismatch, spoof, liveness fail, spot-check fail, permission
        // check, ...) that happens to reuse the same HTTP status. Only the
        // former should ever log the user out.
        //
        // This used to be an opt-OUT list ("log out unless the code is one of
        // these known-safe business codes") — that's backwards-fragile: any
        // business rejection the server added later that wasn't on the list
        // would silently force a logout (this is exactly what happened with
        // verification_unavailable and every spot-check rejection, which had
        // no code at all). Flipped to opt-IN: log out ONLY for codes the
        // server explicitly marks as a genuine auth/session failure
        // (server/middleware/auth.js, server/services/sessionService.js).
        // Everything else — including any code we don't recognize — is
        // treated as a business rejection and never clears the session.
        const responseCode = (parsedData?.code as string) || '';
        const isGenuineAuthFailure = [
          'no_token',
          'invalid_token',
          'token_expired',
          'account_deactivated',
          'session_terminated',
          'session_expired',
          'session_required',
        ].includes(responseCode);

        // If it's a genuine auth error, clear the token and notify UI to log out
        if (!skipAuthClear && isGenuineAuthFailure && (response.status === 401 || response.status === 403)) {
          console.log('Auth error detected, clearing stored token');
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('user');

          // Import inline to avoid cyclic dependencies or header issues,
          // then emit event so AuthContext can actually unmount the protected screens.
          const { DeviceEventEmitter } = require('react-native');
          DeviceEventEmitter.emit('auth:unauthorized');
        }

        return {
          success: false,
          error: errorMessage,
          // Pass the server's structured fields through so callers can tailor
          // the UX (e.g. distinguish a geofence rejection from a face failure).
          code: (parsedData?.code as string) || undefined,
          details: parsedData ?? undefined,
        };
      }

      // Guard: unexpected HTML responses (often proxy/static fallback) should be treated as errors
      if (response.ok && /text\/html/i.test(contentType)) {
        const snippet = (rawText || '').slice(0, 200);
        console.error('Unexpected HTML response for', url, 'treating as error. Snippet:', snippet);
        return {
          success: false,
          error: 'Unexpected HTML response from server',
          message: snippet,
        } as any;
      }

      return {
        success: true,
        data: (isJson ? parsedData : ({ raw: rawText } as any)) as T,
      };
    } catch (error) {
      console.error('API request error:', error);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const errStr = error instanceof Error ? error.message : String(error);
      const isNetworkError = /network/i.test(errStr) || /failed to fetch/i.test(errStr) || /net::/i.test(errStr);
      const message = isAbort
        ? 'Request timed out — the upload took too long. Check your connection and try again.'
        : isNetworkError
          ? 'No internet connection'
          : errStr || 'No internet connection';
      return {
        success: false,
        error: message,
      };
    }
  }

  // Student UID lookup
  async lookupStudentByUID(uid: string): Promise<ApiResponse<StudentLookupResponse>> {
    console.log('[lookupStudentByUID] Starting lookup for UID:', uid);
    console.log('[lookupStudentByUID] Request body:', JSON.stringify({ uid }));

    const response = await this.makeRequest<StudentLookupResponse>('/auth/student/lookup', {
      method: 'POST',
      body: JSON.stringify({ uid }),
    });

    console.log('[lookupStudentByUID] Response:', JSON.stringify(response, null, 2));
    return response;
  }

  // Forgot password: sends a 6-digit OTP to the account's registered email
  async forgotPassword(uid: string): Promise<ApiResponse<{ message: string; maskedEmail: string }>> {
    return this.makeRequest<{ message: string; maskedEmail: string }>('/auth/student/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ uid }),
    });
  }

  // Forgot password step 2: verify the OTP and set a new password
  async resetPassword(uid: string, otp: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeRequest<{ message: string }>('/auth/student/reset-password', {
      method: 'POST',
      body: JSON.stringify({ uid, otp, newPassword }),
    });
  }

  // Defender: link a work PC to this employee by claiming its QR pairing code.
  // The desktop app shows the QR; scanning it here binds that PC to this user.
  async claimDefenderPC(
    pairId: string
  ): Promise<ApiResponse<{ message: string; device?: { hostname?: string; deviceName?: string; os?: string }; employee?: { uid: string; name: string } }>> {
    return this.makeRequest('/defender-pair/claim', {
      method: 'POST',
      body: JSON.stringify({ pairId }),
    });
  }

  // Defender: check if this employee's PC is currently paired/connected.
  async getDefenderPairingStatus(): Promise<ApiResponse<{ paired: boolean; device?: { hostname?: string; deviceName?: string; os?: string } }>> {
    return this.makeRequest('/defender-pair/my-status', { method: 'GET' });
  }

  // Defender: disconnect the paired PC (called on employee checkout).
  async disconnectDefenderPC(): Promise<ApiResponse<{ success: boolean }>> {
    return this.makeRequest('/defender-pair/disconnect', { method: 'POST', body: JSON.stringify({}) });
  }

  // Student login with UID and password
  async studentLogin(uid: string, password: string): Promise<ApiResponse<LoginResponse>> {
    // Public IP + device/network telemetry for the super-admin tracking
    // report. Best-effort (short timeout, missing fields simply omitted) —
    // the server falls back gracefully, so login is never blocked by this.
    const [publicIp, deviceTelemetry] = await Promise.all([
      getPublicIp(),
      collectDeviceTelemetry(),
    ]);
    const response = await this.makeRequest<LoginResponse>('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({
        uid,
        password,
        ...(publicIp ? { publicIp } : {}),
        ...deviceTelemetry,
      }),
    });

    console.log('Student login response received:', JSON.stringify(response, null, 2));

    if (response.success && response.data) {
      // Extract token
      let token = '';
      if (response.data.token && response.data.token !== '') {
        token = response.data.token;
      } else if (response.data.accessToken && response.data.accessToken !== '') {
        token = response.data.accessToken;
      }

      console.log('Extracted token:', token ? 'Token found' : 'No token found');

      // Store token if found
      if (token !== '') {
        await AsyncStorage.setItem('authToken', token);
        console.log('Token stored in AsyncStorage');
      } else {
        console.error('No token found in response');
        return {
          success: false,
          error: 'No authentication token received from server',
        };
      }
      
      // Store user data
      let userData: User;
      
      const studentData = response.data.student;
      if (!studentData) {
        console.error('No student data in response:', response.data);
        return {
          success: false,
          error: 'Invalid response format from server - no student data',
        };
      }
      
      userData = {
        id: studentData.id,
        name: studentData.fullName,
        uid: studentData.uid,
        role: 'student'
      };
      
      console.log('User data extracted:', userData);

      // Defense-in-depth for the shared/borrowed-phone case: if the app was
      // killed or a previous logout didn't run cleanly, stale WatermelonDB
      // rows from a DIFFERENT account could still be sitting on this device.
      // Compare against whatever uid was cached before this login and wipe
      // first if it doesn't match, so the new account never inherits it.
      try {
        const prevUserRaw = await AsyncStorage.getItem('user');
        const prevUid = prevUserRaw ? JSON.parse(prevUserRaw)?.uid : null;
        if (prevUid && prevUid !== userData.uid) {
          console.log('[db] Different account logging in on this device — resetting local cache');
          await resetLocalCache();
        }
      } catch (e: any) {
        console.warn('[db] pre-login cache-owner check failed:', e?.message);
      }

      await AsyncStorage.setItem('user', JSON.stringify(userData));

      // Store student and organization data
      await AsyncStorage.setItem('studentData', JSON.stringify(studentData));
      await AsyncStorage.setItem('organizationData', JSON.stringify(studentData.organization));

      // Mirror into the local WatermelonDB cache so Settings/profile screens
      // can read instantly on next app open without waiting on the network
      // (see saveProfile/saveOrganization for the read-through pattern).
      saveProfile(studentData.uid, studentData).catch((e) =>
        console.warn('[db] saveProfile failed:', e?.message)
      );
      if (studentData.organization?.id) {
        saveOrganization(studentData.organization.id, studentData.organization).catch((e) =>
          console.warn('[db] saveOrganization failed:', e?.message)
        );
      }

      // Update response data with proper user object
      response.data.user = userData;
    }

    return response;
  }

  // Authentication endpoints (keeping for backward compatibility)
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    const [publicIp, deviceTelemetry] = await Promise.all([
      getPublicIp(),
      collectDeviceTelemetry(),
    ]);
    const response = await this.makeRequest<LoginResponse>('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        ...(publicIp ? { publicIp } : {}),
        ...deviceTelemetry,
      }),
    });

    console.log('Login response received:', JSON.stringify(response, null, 2));

    if (response.success && response.data) {
      // Try to extract token from different possible locations
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

      console.log('Extracted token:', token ? 'Token found' : 'No token found');

      // Store token if found
      if (token !== '') {
        await AsyncStorage.setItem('authToken', token);
        console.log('Token stored in AsyncStorage');
      } else {
        console.error('No token found in response');
        return {
          success: false,
          error: 'No authentication token received from server',
        };
      }
      
      // Store user data - handle different response structures
      let userData: User;
      
      const studentData = response.data.data?.student || response.data.student || response.data.user;
      if (!studentData) {
        console.error('No student data in response:', response.data);
        return {
          success: false,
          error: 'Invalid response format from server - no student data',
        };
      }
      
      userData = {
        id: (studentData._id as string) || (studentData.id as string),
        email: studentData.email as string,
        name: studentData.name as string,
        role: 'student'
      };
      
      console.log('User data extracted:', userData);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      // Update response data with proper user object
      response.data.user = userData;
    }

    return response;
  }

  async register(email: string, password: string, name: string): Promise<ApiResponse<LoginResponse>> {
    const response = await this.makeRequest<LoginResponse>('/auth/student/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });

    if (response.success && response.data) {
      // Store token
      if (response.data.token && response.data.token !== '') {
        await AsyncStorage.setItem('authToken', response.data.token);
      }
      
      // Store user data - handle different response structures
      let userData: User;
      
      const studentData = response.data.data?.student || response.data.student || response.data.user;
      if (!studentData) {
        console.error('No student data in response:', response.data);
        return {
          success: false,
          error: 'Invalid response format from server',
        };
      }
      
      userData = {
        id: (studentData._id as string) || (studentData.id as string),
        email: studentData.email as string,
        name: studentData.name as string,
        role: 'student'
      };
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      // Update response data with proper user object
      response.data.user = userData;
    }

    return response;
  }

  async logout(): Promise<void> {
    try {
      // 1. Clear local storage IMMEDIATELY so UI transitions to logged-out state instantly
      const keys = ['fcmToken', 'authToken', 'user', 'studentData', 'organizationData'];
      await AsyncStorage.multiRemove(keys).catch(() => {});

      // Wipe the local WatermelonDB cache too — otherwise a different person
      // logging in on this same device (borrowed/replacement phone) could see
      // this account's cached leave/attendance/etc data. See resetLocalCache().
      resetLocalCache().catch((e) => console.warn('[db] logout cache reset failed:', e?.message));

      // 2. Perform server-side session cleanup & FCM unregistration in background
      Promise.allSettled([
        this.updateLocationStatus({ status: 'logged_out', reason: 'user_logout' }),
        this.makeRequest('/portal/logout', { method: 'POST' }),
        this.removeFCMToken(),
      ]).catch((e) => console.warn('[api] background logout cleanup:', e));
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // Student management endpoints
  async getStudents(): Promise<ApiResponse<Student[]>> {
    console.log('Getting students...');
    const response = await this.makeRequest<{data: Student[], success: boolean}>('/students');
    console.log('Get students response:', response);
    
    // Extract the students array from the nested response
    if (response.success) {
      const payload: any = response.data as any;
      const list: Student[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      return {
        success: true,
        data: list,
        message: (response as any).message,
      };
    }
    
    return { success: false, error: response.error };
  }

  async addStudent(studentData: {
    name: string;
    email: string;
    faceData?: string;
  }): Promise<ApiResponse<Student>> {
    console.log('Adding student with data:', studentData);
    
    // Debug token status before making request
    await this.debugTokenStatus();
    
    const response = await this.makeRequest<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(studentData),
    });
    
    console.log('Add student response:', response);
    
    if (!response.success) {
      console.error('Add student failed:', response.error);
      
      // Provide specific guidance for different error types
      if (response.error && response.error.includes('route not found')) {
        throw new Error('Student management endpoint not found. Please check if your backend has the /students endpoint implemented.');
      } else if (response.error && (response.error.includes('token') || response.error.includes('auth'))) {
        throw new Error('Authentication failed. Please log out and log back in.');
      }
    }
    
    // Handle response data structure
    if (response.success && response.data) {
      console.log('Processing addStudent response data:', JSON.stringify(response.data, null, 2));
      
      // Check if data is directly the student object
      if (response.data && typeof response.data === 'object' && (response.data as any)._id) {
        console.log('Found direct student data with ID:', (response.data as any)._id);
        // Convert _id to id for frontend compatibility
        const studentData = {
          ...response.data,
          id: (response.data as any)._id
        };
        return {
          success: true,
          data: studentData,
          message: response.message
        };
      }
      
      // Check if data has nested structure
      if (response.data && typeof response.data === 'object' && 'data' in response.data) {
        const nestedData = response.data as any;
        if (nestedData.data && nestedData.data.student) {
          console.log('Found nested student data');
          // Convert _id to id for frontend compatibility
          const studentData = {
            ...nestedData.data.student,
            id: nestedData.data.student._id
          };
          return {
            success: true,
            data: studentData,
            message: nestedData.message
          };
        }
      }
      
      // If we get here, the data structure is unexpected
      console.error('Unexpected response data structure:', response.data);
    }
    
    return response;
  }

  async updateStudent(studentId: string, studentData: {
    name?: string;
    email?: string;
    faceData?: string;
  }): Promise<ApiResponse<Student>> {
    console.log('Updating student:', studentId, 'with data:', studentData);
    
    const response = await this.makeRequest<Student>(`/students/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify(studentData),
    });
    
    console.log('Update student response:', response);
    return response;
  }

  async deleteStudent(studentId: string): Promise<ApiResponse<void>> {
    console.log('Deleting student:', studentId);
    
    const response = await this.makeRequest<void>(`/students/${studentId}`, {
      method: 'DELETE',
    });
    
    console.log('Delete student response:', response);
    return response;
  }

  async uploadStudentFace(studentId: string, faceImage: any): Promise<ApiResponse<Student>> {
    const formData = new FormData();
    formData.append('face_image', faceImage);
    formData.append('student_id', studentId);

    const response = await this.makeRequest<Student>(`/students/${studentId}/face`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });
    
    // Handle nested response structure from backend
    if (response.success && response.data && typeof response.data === 'object' && 'data' in response.data) {
      const nestedData = response.data as any;
      if (nestedData.data && nestedData.data.student) {
        return {
          success: true,
          data: nestedData.data.student,
          message: nestedData.message
        };
      }
    }
    
    return response;
  }

  // Create default student with face data
  async createDefaultStudent(): Promise<ApiResponse<Student>> {
    console.log('Creating default student...');
    const response = await this.makeRequest<Student>('/students/default', {
      method: 'POST',
    });
    console.log('Create default student response:', response);
    
    // Handle nested response structure from backend
    if (response.success && response.data && typeof response.data === 'object' && 'data' in response.data) {
      const nestedData = response.data as any;
      if (nestedData.data && nestedData.data.student) {
        return {
          success: true,
          data: nestedData.data.student,
          message: nestedData.message
        };
      }
    }
    
    return response;
  }

  // Get organization attendance data
  async getOrganizationAttendance(filters?: {
    startDate?: string;
    endDate?: string;
    studentId?: string;
    type?: 'in' | 'out';
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<{
    attendance: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.studentId) queryParams.append('studentId', filters.studentId);
    if (filters?.type) queryParams.append('type', filters.type);
    if (filters?.limit) queryParams.append('limit', filters.limit.toString());
    if (filters?.page) queryParams.append('page', filters.page.toString());

    const endpoint = `/attendance${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  // Get specific student attendance
  async getStudentAttendance(studentId: string, filters?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<{
    student: Student;
    attendance: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.limit) queryParams.append('limit', filters.limit.toString());
    if (filters?.page) queryParams.append('page', filters.page.toString());

    const endpoint = `/students/${studentId}/attendance${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  // Attendance endpoints
  async markAttendance(attendanceData: {
    type: 'in' | 'out';
    latitude: number;
    longitude: number;
    faceImage?: any;
    authMethod?: 'face' | 'voice' | 'iris' | 'thumb' | 'manual';
    // SAACMS §6: liveness evidence the server re-adjudicates (anti-replay).
    livenessNonce?: string;
    livenessEvents?: Array<Record<string, any>>;
    // Device + camera attestation for the server's injection/deepfake guard.
    attestation?: Record<string, any>;
    // Other frames from the SAME liveness session as `faceImage` — lets
    // /attendance/mark's independent re-verification use the same
    // multi-frame evidence /verify-face already fused, instead of judging
    // this one frame in isolation.
    frames?: string[];
  }): Promise<ApiResponse<Attendance>> {
    // Public IP + device/network telemetry for the super-admin tracking
    // report. Best-effort (short timeout, missing fields simply omitted) —
    // the server falls back gracefully, so marking is never blocked by this.
    const [publicIp, deviceTelemetry] = await Promise.all([
      getPublicIp(),
      collectDeviceTelemetry(),
    ]);

    const requestData: any = {
      type: attendanceData.type,
      latitude: attendanceData.latitude,
      longitude: attendanceData.longitude,
      authMethod: attendanceData.authMethod || 'face',
      ...deviceTelemetry,
    };

    if (publicIp) {
      requestData.publicIp = publicIp;
    }

    if (attendanceData.attestation) {
      requestData.attestation = attendanceData.attestation;
    }

    if (attendanceData.faceImage) {
      // Send both keys: the server reads `faceImage`; `face_image` kept for
      // backward compatibility with older handlers.
      requestData.faceImage = attendanceData.faceImage;
      requestData.face_image = attendanceData.faceImage;
    }

    if (attendanceData.livenessNonce) {
      requestData.livenessNonce = attendanceData.livenessNonce;
      requestData.livenessEvents = attendanceData.livenessEvents || [];
    }

    if (attendanceData.frames && attendanceData.frames.length > 0) {
      requestData.frames = attendanceData.frames;
    }

    return this.makeRequest<Attendance>('/attendance/mark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
  }

  // Server-issued liveness challenge: a single-use nonce + randomized action
  // sequence. The evidence collected while performing it goes back with the
  // attendance mark (livenessNonce + livenessEvents), where the server
  // re-adjudicates it — the client is a sensor, never the judge.
  async getLivenessChallenge(): Promise<ApiResponse<{
    challenge: {
      nonce: string;
      sequence: Array<'blink' | 'turn_left' | 'turn_right' | 'nod' | 'smile'>;
      issuedAt: number;
      expiresAt: number;
      perActionWindowMs: number;
      hmac: string;
    };
  }>> {
    return this.makeRequest('/liveness/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getAttendanceHistory(filters?: {
    startDate?: string;
    endDate?: string;
    studentId?: string;
    limit?: number;
    page?: number;
    // Set by an explicit user-triggered refresh (pull-to-refresh, a visible
    // "Refresh" button) to bypass the TTL cache below. Without this, pressing
    // refresh within the TTL window silently did nothing — it just handed
    // back the same cached data, so the button looked broken even though
    // "no network call happened" was the TTL system working exactly as
    // designed for the ambient/background case. A deliberate refresh always
    // means "I know this might be stale, go check now."
    forceRefresh?: boolean;
  }): Promise<ApiResponse<Attendance[]>> {
    const queryParams = new URLSearchParams();
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.studentId) queryParams.append('studentId', filters.studentId);
    if (filters?.limit) queryParams.append('limit', filters.limit.toString());
    if (filters?.page) queryParams.append('page', filters.page.toString());

    // TTL-skip only applies to the plain "recent history" call (no explicit
    // date range) — that's the repeated one (screen mount/refresh). A
    // date-filtered report query is a deliberate one-off lookup, always fresh.
    const isDefaultQuery = !filters?.startDate && !filters?.endDate;
    const ttlKey = `attendance_history:${filters?.studentId || 'me'}`;
    if (!filters?.forceRefresh && isDefaultQuery && (await isFresh(ttlKey, TTL.attendanceHistory))) {
      const cached = await getCachedAttendanceRecords(filters?.limit || 100);
      if (cached.length > 0) {
        return { success: true, data: cached as any };
      }
    }

    const endpoint = `/attendance/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.makeRequest<Attendance[]>(endpoint);
    if (response.success && response.data) {
      // Same "find the array" flexibility AttendanceScreen.tsx uses when
      // reading this response — the backend nests it under `.attendance` on
      // some paths, plain array on others.
      const raw: any = response.data;
      const records: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.attendance) ? raw.attendance : [];
      if (records.length > 0) {
        saveAttendanceRecords(records).catch((e) => console.warn('[db] saveAttendanceRecords failed:', e?.message));
        if (isDefaultQuery) markSynced(ttlKey).catch(() => {});
      }
      return response;
    }

    // Offline/server-unreachable — fall back to whatever this range last
    // looked like locally instead of an empty list. AttendanceDashboard's
    // Monthly Detailed Report renders every day with no record as "Absent",
    // so returning [] here (the old behaviour) made a whole offline month
    // read as a full month of absences instead of "we don't know yet".
    const cachedAll = await getCachedAttendanceRecords(Math.max(filters?.limit || 100, 1000));
    if (cachedAll.length > 0) {
      let filtered = cachedAll;
      if (filters?.startDate || filters?.endDate) {
        const start = filters?.startDate ? new Date(filters.startDate).getTime() : -Infinity;
        const end = filters?.endDate ? new Date(filters.endDate).getTime() : Infinity;
        filtered = cachedAll.filter((r: any) => {
          const t = new Date(r.timestamp || r.createdAt).getTime();
          return t >= start && t <= end;
        });
      }
      if (filtered.length > 0) {
        return { success: true, data: filtered as any };
      }
    }
    return response;
  }

  async getAttendanceStats(filters?: {
    startDate?: string;
    endDate?: string;
    studentId?: string;
    forceRefresh?: boolean;
  }): Promise<ApiResponse<{
    totalRecords: number;
    presentDays: number;
    absentDays: number;
    averageDistance?: number;
  }>> {
    const queryParams = new URLSearchParams();
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.studentId) queryParams.append('studentId', filters.studentId);

    const periodKey = `${filters?.startDate || 'all'}_${filters?.endDate || 'all'}`;
    const ttlKey = `attendance_stats:${periodKey}`;
    if (!filters?.forceRefresh && (await isFresh(ttlKey, TTL.attendanceStats))) {
      const cached = await getCachedAttendanceStats(periodKey);
      if (cached) return { success: true, data: cached };
    }

    const endpoint = `/attendance/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.makeRequest<{
      totalRecords: number;
      presentDays: number;
      absentDays: number;
      averageDistance?: number;
    }>(endpoint);
    if (response.success && response.data) {
      saveAttendanceStats(periodKey, response.data).catch((e) =>
        console.warn('[db] saveAttendanceStats failed:', e?.message)
      );
      markSynced(ttlKey).catch(() => {});
      return response;
    }

    // Offline/server-unreachable and the TTL had already expired above —
    // still prefer stale local stats over a failure (which reads as
    // "0 records, everything absent" on the dashboard).
    const stale = await getCachedAttendanceStats(periodKey);
    if (stale) return { success: true, data: stale };
    return response;
  }

  // Leave request endpoints
  async createCheckoutRequest(payload: { date: string; details: string; latitude?: number; longitude?: number; evidence?: string[] }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/cheakout-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getMyCheckoutRequests(forceRefresh?: boolean): Promise<ApiResponse<any[]>> {
    if (!forceRefresh && (await isFresh('checkout_requests', TTL.leaveFieldCheckout))) {
      const cached = await getCachedCheckoutRequests();
      if (cached.length > 0) return { success: true, data: cached };
    }
    const response = await this.makeRequest<any[]>('/get-cheakout-request');
    if (response.success && response.data) {
      const records = extractRequestArray(response.data, ['requests', 'checkoutRequests']);
      saveCheckoutRequests(records).catch((e) => console.warn('[db] saveCheckoutRequests failed:', e?.message));
      markSynced('checkout_requests').catch(() => {});
    }
    return response;
  }

  async applyLeave(payload: {
    startDate: string; // yyyy-mm-dd
    endDate: string;   // yyyy-mm-dd
    reason: string;
    notes?: string;
    studentId?: string;
    /** Colleague (same department) to CC as the cover for this leave — optional. */
    delegateId?: string;
    contactNumber?: string;
    addressDuringLeave?: string;
    expectedReturnDate?: string;
    comments?: string;
  }): Promise<ApiResponse<any>> {
    // Call legacy route first to avoid 404 noise in production
    const legacyBody = {
      leaveDetails: payload.reason,
      leaveDates: { start: payload.startDate, end: payload.endDate },
      delegateId: payload.delegateId,
      notes: payload.notes,
      contactNumber: payload.contactNumber,
      addressDuringLeave: payload.addressDuringLeave,
      expectedReturnDate: payload.expectedReturnDate,
      comments: payload.comments,
    } as any;

    const legacy = await this.makeRequest<any>('/leave-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyBody),
    });
    if (legacy.success) return legacy;

    // If legacy route is missing (on newer servers), try the new endpoint
    const looksLikeLegacyMissing = typeof legacy.error === 'string' && (
      legacy.error.includes('Cannot POST') ||
      legacy.error.includes('Not Found') ||
      legacy.error.includes('404')
    );
    if (!looksLikeLegacyMissing) return legacy;

    return this.makeRequest<any>('/leave/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /** Configurable leave types available to the signed-in employee (backend-filtered by gender/role). */
  async getLeaveTypes(): Promise<ApiResponse<any[]>> {
    return this.makeRequest<any[]>('/leave-types');
  }

  /**
   * Enterprise leave application (multipart) — carries the leave type, all the
   * rich fields and any supporting documents. Uses a raw fetch (not makeRequest)
   * because FormData must set its OWN multipart boundary — forcing an
   * application/json Content-Type would corrupt the upload.
   */
  async applyLeaveV3(
    payload: {
      leaveTypeId: string;
      startDate: string; // yyyy-mm-dd
      endDate: string; // yyyy-mm-dd
      dayPortion?: 'full' | 'half';
      halfDayType?: 'first' | 'second' | null;
      reason: string;
      description?: string;
      comments?: string;
      isEmergency?: boolean;
      contactNumber?: string;
      addressDuringLeave?: string;
      workHandoverTo?: string;
      expectedReturnDate?: string; // yyyy-mm-dd
    },
    files?: { medical?: any[]; supporting?: any[] }
  ): Promise<ApiResponse<any>> {
    try {
      const token = await this.getAuthToken();
      const url = `${getApiBaseUrl()}/leaves/apply-v3`;
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        fd.append(k, typeof v === 'boolean' ? String(v) : String(v));
      });
      const appendFile = (field: string, f: any, i: number) => {
        const uri = f?.path || f?.uri;
        if (!uri) return;
        fd.append(field, {
          uri,
          name: f?.filename || `${field}-${Date.now()}-${i}.jpg`,
          type: f?.mime || 'image/jpeg',
        } as any);
      };
      (files?.medical || []).forEach((f, i) => appendFile('medicalCertificate', f, i));
      (files?.supporting || []).forEach((f, i) => appendFile('supportingDocuments', f, i));

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token && token.trim()) {
        const t = token.trim();
        headers.Authorization = /^bearer\s+/i.test(t) ? t : `Bearer ${t}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers, body: fd, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON */
      }
      if (!res.ok) {
        return { success: false, error: data?.error || data?.message || `Request failed (${res.status})` } as any;
      }
      return { success: true, data: data?.data ?? data } as any;
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'The request timed out. Check your connection and try again.' : (e?.message || 'Failed to submit leave request');
      return { success: false, error: msg } as any;
    }
  }

  async applyLeaveBulk(payload: {
    dates: string[]; // array of yyyy-mm-dd
    reason: string;
    notes?: string;
    studentId?: string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/leave/apply-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /** Colleagues (same organization + department) selectable as a leave delegate. */
  async getDepartmentColleagues(): Promise<ApiResponse<Array<{ _id: string; fullName: string; uid: string; designation?: string; role?: string }>>> {
    const response = await this.makeRequest<any>('/leaves/colleagues');
    if (!response.success) return response;

    // makeRequest preserves the server JSON envelope in `data`; expose the
    // actual colleague array to the screen consistently across old/new APIs.
    const body = response.data;
    const colleagues = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : [];
    return { success: true, data: colleagues };
  }

  async getLeaveRequests(filters?: {
    startDate?: string;
    endDate?: string;
    status?: 'pending' | 'approved' | 'rejected';
    limit?: number;
    page?: number;
    forceRefresh?: boolean;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.limit) queryParams.append('limit', String(filters.limit));
    if (filters?.page) queryParams.append('page', String(filters.page));

    // TTL-skip only for the unfiltered "give me everything" call (how
    // RequestScreen calls this) — a filtered/paginated lookup always hits
    // the network fresh.
    const isDefaultQuery = !queryParams.toString();
    if (!filters?.forceRefresh && isDefaultQuery && (await isFresh('leave_requests', TTL.leaveFieldCheckout))) {
      const cached = await getCachedLeaveRequests();
      if (cached.length > 0) return { success: true, data: cached };
    }

    console.log('[api] getLeaveRequests calling /leaves/my');
    const primary = await this.makeRequest<any>(`/leaves/my${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    console.log('[api] /leaves/my success:', primary.success, 'keys:', primary && Object.keys(primary || {}).join(','));
    if (primary.success) {
      const records = extractRequestArray(primary.data, ['leaves', 'requests']);
      if (records.length > 0) {
        saveLeaveRequests(records).catch((e) => console.warn('[db] saveLeaveRequests failed:', e?.message));
        if (isDefaultQuery) markSynced('leave_requests').catch(() => {});
      }
      return {
        success: true,
        data: primary.data?.data || primary.data || [],
      };
    }

    console.log('[api] getLeaveRequests: not using legacy /leave/my to avoid HTML responses');


    return { success: false, error: primary.error || 'Failed to fetch leave requests. Please re-login and try again.' } as any;
  }

  /** Cancel your own pending leave request — only allowed within 1 hour of submitting it. */
  async cancelLeaveRequest(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/leaves/${id}`, { method: 'DELETE' });
  }

  /** Cancel your own pending checkout request — only allowed within 1 hour of submitting it. */
  async cancelCheckoutRequest(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/cheakout-request/${id}`, { method: 'DELETE' });
  }

  /** Cancel your own pending regularization request */
  async cancelRegularizationRequest(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/regularization/${id}`, { method: 'DELETE' });
  }

  // Store face authentication result
  async storeFaceAuthentication(authData: {
    userId: string;
    success: boolean;
    confidence: number;
    message: string;
    attendanceType?: 'in' | 'out' | null;
    timestamp: string;
    imageData: string;
    latitude?: number;
    longitude?: number;
  }): Promise<ApiResponse<any>> {
    // Map the authData to the format expected by /attendance/mark
    const [publicIp, deviceTelemetry] = await Promise.all([
      getPublicIp(),
      collectDeviceTelemetry(),
    ]);
    const attendanceData = {
      type: authData.attendanceType || 'in',
      latitude: authData.latitude || 0,
      longitude: authData.longitude || 0,
      faceImage: authData.imageData,
      authMethod: 'face',
      ...(publicIp ? { publicIp } : {}),
      ...deviceTelemetry,
    };

    console.log('[API] Storing face authentication:', {
      originalData: {
        userId: authData.userId,
        success: authData.success,
        attendanceType: authData.attendanceType,
        hasLocation: !!(authData.latitude && authData.longitude)
      },
      mappedData: attendanceData
    });

    try {
      const response = await this.makeRequest('/attendance/mark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attendanceData),
      });

      console.log('[API] Face authentication stored successfully:', response);
      return response;
    } catch (error) {
      console.error('[API] Failed to store face authentication:', error);
      throw error;
    }
  }

  // Field request endpoints
  async applyField(payload: {
    eventTitle: string;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
    location?: string;
    accompaniedBy?: string;
    /** Base64/data-URL proof photos captured at request time. */
    evidence?: string[];
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/field/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getFieldRequests(filters?: {
    status?: 'pending' | 'approved' | 'rejected' | 'no_response';
    limit?: number;
    page?: number;
    forceRefresh?: boolean;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.limit) queryParams.append('limit', String(filters.limit));
    if (filters?.page) queryParams.append('page', String(filters.page));

    const isDefaultQuery = !queryParams.toString();
    if (!filters?.forceRefresh && isDefaultQuery && (await isFresh('field_requests', TTL.leaveFieldCheckout))) {
      const cached = await getCachedFieldRequests();
      if (cached.length > 0) return { success: true, data: cached };
    }

    const response = await this.makeRequest<any>(
      `/field/my${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
      { skipAuthClear: true },
    );
    if (response.success && response.data) {
      const records = extractRequestArray(response.data, ['requests', 'fieldRequests']);
      if (records.length > 0) {
        saveFieldRequests(records).catch((e) => console.warn('[db] saveFieldRequests failed:', e?.message));
        if (isDefaultQuery) markSynced('field_requests').catch(() => {});
      }
    }
    return response;
  }

  /** Cancel your own pending field request — only allowed within 1 hour of submitting it. */
  async cancelFieldRequest(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/field/${id}`, { method: 'DELETE' });
  }

  // Upload the event-day report (photos / written report / documents) for an
  // approved field request. Files are sent as base64, matching how the app
  // already persists evidence photos.
  async submitFieldReport(
    requestId: string,
    payload: {
      notes?: string;
      photos?: Array<{ label?: string; image: string }>;
      documents?: Array<{ name?: string; mimeType?: string; data: string }>;
    },
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/field/${requestId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Get face authentication history
  async getFaceAuthHistory(filters?: {
    userId?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<{
    records: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (filters?.userId) queryParams.append('userId', filters.userId);
    if (filters?.success !== undefined) queryParams.append('success', filters.success.toString());
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);
    if (filters?.limit) queryParams.append('limit', filters.limit.toString());
    if (filters?.page) queryParams.append('page', filters.page.toString());

    const endpoint = `/face-auth/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  // Get face authentication statistics
  async getFaceAuthStats(filters?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (filters?.userId) queryParams.append('userId', filters.userId);
    if (filters?.startDate) queryParams.append('startDate', filters.startDate);
    if (filters?.endDate) queryParams.append('endDate', filters.endDate);

    const endpoint = `/face-auth/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  // Get WFH status for current user
  async getWFHStatus(): Promise<ApiResponse<{
    hasActiveWFH: boolean;
    currentAssignment?: {
      startDate: string;
      endDate: string;
      reason: string;
      assignedBy: string;
      assignedAt: string;
    };
    legacyWFH?: string;
  }>> {
    type WFHStatusData = {
      hasActiveWFH: boolean;
      currentAssignment?: {
        startDate: string;
        endDate: string;
        reason: string;
        assignedBy: string;
        assignedAt: string;
      };
      legacyWFH?: string;
    };

    const cacheWfh = async (data: WFHStatusData) => {
      try {
        const rawUser = await AsyncStorage.getItem('user');
        const uid = rawUser ? JSON.parse(rawUser)?.uid : null;
        if (uid) await saveWfhStatus(uid, data);
      } catch (e: any) {
        console.warn('[db] saveWfhStatus failed:', e?.message);
      }
    };

    // Try the new WFH assignments endpoint first
    try {
      const response = await this.makeRequest<WFHStatusData>('/wfh/status', { skipAuthClear: true });
      if (response.success) {
        if (response.data) cacheWfh(response.data);
        return response;
      }
    } catch (error) {
      console.log('New WFH status endpoint failed, trying legacy endpoint');
    }

    // Fallback to legacy WFH status endpoint
    const fallback = await this.makeRequest<WFHStatusData>('/wfh/status', { skipAuthClear: true });
    if (fallback.success && fallback.data) cacheWfh(fallback.data);
    return fallback;
  }

  // Debug WFH data
  async getWFHDebugInfo(): Promise<ApiResponse<any>> {
    return this.makeRequest('/wfh/debug');
  }

  // Test authentication
  async testWFHAuth(): Promise<ApiResponse<any>> {
    return this.makeRequest('/wfh/test-auth');
  }

  // Face recognition endpoint
  async verifyFace(faceImage: any): Promise<ApiResponse<{
  match: boolean;
  confidence?: number;
  reason?: string;
  name?: string;
}>> {
  // Route through the BACKEND verify-face (NOT check.py directly): the server
  // derives the identity from the auth token (no user_id sent) and logs the
  // attempt image for admin review.
  const formData = new FormData();
  if (faceImage && faceImage.path) {
    const path = String(faceImage.path);
    formData.append('face_image', {
      uri: path.startsWith('file') ? path : `file://${path}`,
      name: 'face.jpg',
      type: 'image/jpeg',
    } as any);
  } else if (faceImage && faceImage.uri) {
    formData.append('face_image', {
      uri: faceImage.uri,
      name: 'face.jpg',
      type: 'image/jpeg',
    } as any);
  } else if (faceImage) {
    formData.append('face_image', faceImage);
  } else {
    return { success: false, error: 'No image provided for verification' };
  }

  try {
    const token = await this.getAuthToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      const t = token.trim();
      headers.Authorization = /^bearer\s+/i.test(t) ? t : `Bearer ${t}`;
    }
    const url = `${getApiBaseUrl()}/attendance/verify-face`;
    console.log('Making verify-face request to:', url);
    const response = await fetch(url, { method: 'POST', headers, body: formData });
    const data = await response.json();
    console.log('Verify face response:', data);

    if (!response.ok || data?.success === false) {
      return {
        success: false,
        error: data?.message || data?.reason || `HTTP ${response.status}`,
        data: { match: false, reason: data?.reason },
      };
    }

    return {
      success: true,
      data: {
        match: data.match === true,
        confidence: typeof data.similarity === 'number' ? data.similarity : (data.score ?? undefined),
        reason: data.reason ?? undefined,
        name: data.name ?? undefined,
      },
    };
  } catch (error) {
    console.error('Verify face error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

  // Palm recognition endpoint
  async verifyPalm(palmImage: any, userId?: string, latitude?: number, longitude?: number): Promise<ApiResponse<{
    success: boolean;
    message: string;
    data?: {
      userId: string;
      authMethod: string;
      timestamp: string;
      similarity: number;
      attendanceId: string;
    };
  }>> {
    const formData = new FormData();
    
    // Format the image properly for the backend
    if (palmImage && palmImage.path) {
      // For React Native Camera images
      formData.append('palm_image', {
        uri: palmImage.path,
        name: 'palm.jpg',
        type: 'image/jpeg',
      } as any);
    } else if (palmImage) {
      // For other image formats, append directly
      formData.append('palm_image', palmImage);
    } else {
      return {
        success: false,
        error: 'No palm image provided for verification',
      };
    }
    
    // If userId is not provided, try to get it from stored user data
    let finalUserId = userId;
    
    if (!finalUserId) {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        try {
          const parsedUserData = JSON.parse(userData);
          finalUserId = parsedUserData.id || parsedUserData._id || parsedUserData.uid;
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }
    }
    
    if (!finalUserId) {
      return {
        success: false,
        error: 'User ID not found. Please login again.',
      };
    }
    
    formData.append('user_id', finalUserId);
    
    // Add location data if provided
    if (latitude !== undefined && longitude !== undefined) {
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
    }
    
    console.log('Sending to palm verification API:', {
      user_id: finalUserId,
      palm_image: palmImage?.path ? 'camera_image' : 'other_image',
      latitude,
      longitude,
      api_url: `${getApiBaseUrl()}/verify-palm`
    });

    try {
      const response = await fetch(`${getApiBaseUrl()}/verify-palm`, {
        method: 'POST',
        body: formData,
      });
      
      console.log('Verify palm response status:', response.status);

      const data = await response.json();
      console.log('Verify palm response:', data);

      if (!response.ok) {
        return {
          success: false,
          error: data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data: data as {
          success: boolean;
          message: string;
          data?: {
            userId: string;
            authMethod: string;
            timestamp: string;
            similarity: number;
            attendanceId: string;
          };
        },
      };
    } catch (error) {
      console.error('Verify palm error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Local task engine endpoints
  async getMyTasks(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/tasks/my', { method: 'GET' });
  }

  async getTaskBoard(projectId?: string): Promise<ApiResponse<any>> {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return this.makeRequest<any>(`/tasks/board${query}`, { method: 'GET' });
  }

  async transitionTask(taskId: string, payload: { newStatus: string; comment?: string; biometricAuthToken?: string }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/tasks/issues/${taskId}/transition`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getTaskInsights(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/tasks/insights', { method: 'GET' });
  }

  // Utility methods
  async checkAuthStatus(): Promise<ApiResponse<User>> {
    return this.makeRequest<User>('/auth/me');
  }

  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    const response = await this.makeRequest<{ token: string }>('/auth/refresh', {
      method: 'POST',
    });

    if (response.success && response.data && response.data.token) {
      await AsyncStorage.setItem('authToken', response.data.token);
    }

    return response;
  }

  async getStudentProfile(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/profile');
  }

  // Full own-profile incl. enrolled faceImages. Goes through makeRequest so it
  // uses the same auth token + base URL as every other working call (the
  // Profile screen previously hand-rolled fetch() and broke when the host or
  // token path differed).
  async getStudentDetails(studentId: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/get-student-details/${studentId}`);
  }

  async getStudentOrganization(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/organization');
  }

  // Test organization authentication
  async testOrganizationAuth(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/org/test');
  }

  // Location Management Methods
  async getStudentLocations(): Promise<ApiResponse<Array<{
    _id: string;
    name: string;
    address: {
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
    coordinates: {
      latitude: number;
      longitude: number;
    };
    geofenceRadius: number;
    workingHours: {
      start: string;
      end: string;
    };
    description?: string;
    isCurrent: boolean;
    isPrimary: boolean;
    isActive: boolean;
  }>>> {
    return this.makeRequest<Array<any>>('/student/locations', {
      method: 'GET',
    });
  }

  async getCurrentLocation(): Promise<ApiResponse<{
    location: {
      _id: string;
      name: string;
      coordinates: {
        latitude: number;
        longitude: number;
      };
      geofenceRadius: number;
    };
    geofenceRadius: number;
  }>> {
    return this.makeRequest<any>('/student/current-location', {
      method: 'GET',
    });
  }

  // Live location update for tracking
  async updateLiveLocation(payload: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
    timestamp?: number | string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/live-location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      skipAuthClear: true
    });
  }

  async startLiveLocationShare(payload: {
    durationMinutes: number;
    destination: string;
    reason: string;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/live-location/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async stopLiveLocationShare(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/live-location/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  async updateLocationStatus(payload: {
    status: 'live' | 'offline' | 'stopped' | 'logged_out';
    reason?: string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/student/location-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async requestLocationChange(locationId: string, reason: string): Promise<ApiResponse<{
    request?: {
      _id: string;
      requestedLocation: string;
      reason: string;
      status: 'pending' | 'approved' | 'rejected';
      requestedAt: string;
    };
    newLocation?: any;
    requiresApproval: boolean;
  }>> {
    return this.makeRequest<any>('/student/request-location-change', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        reason
      }),
    });
  }

  async getLocationRequests(): Promise<ApiResponse<Array<{
    _id: string;
    requestedLocation: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
    approvedAt?: string;
    rejectionReason?: string;
    locationDetails?: {
      name: string;
      address: any;
    };
  }>>> {
    return this.makeRequest<Array<any>>('/student/location-requests', {
      method: 'GET',
    });
  }

  // Refresh organization data from server
  async refreshOrganizationData(): Promise<ApiResponse<any>> {
    try {
      console.log('Refreshing organization data from server...');
      
      // Get fresh student data which includes organization info
      const response = await this.makeRequest<any>('/auth/me');
      
      if (response.success && response.data) {
        // Store fresh data
        await AsyncStorage.setItem('studentData', JSON.stringify(response.data));
        if (response.data.uid) {
          saveProfile(response.data.uid, response.data).catch((e) =>
            console.warn('[db] saveProfile failed:', e?.message)
          );
        }

        if (response.data.organization) {
          await AsyncStorage.setItem('organizationData', JSON.stringify(response.data.organization));
          console.log('Organization data refreshed and cached');
          if (response.data.organization.id) {
            saveOrganization(response.data.organization.id, response.data.organization).catch((e) =>
              console.warn('[db] saveOrganization failed:', e?.message)
            );
          }
        }
        
        return response;
      }
      
      return response;
    } catch (error) {
      console.error('Error refreshing organization data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh organization data'
      };
    }
  }

  // Get fresh current location from server
  async refreshCurrentLocation(): Promise<ApiResponse<any>> {
    try {
      console.log('Refreshing current location from server...');
      
      const response = await this.getCurrentLocation();
      
      if (response.success && response.data) {
        // Update cached location data
        await AsyncStorage.setItem('currentLocationData', JSON.stringify(response.data));
        console.log('Current location refreshed and cached');
      }
      
      return response;
    } catch (error) {
      console.error('Error refreshing current location:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh current location'
      };
    }
  }

  // FCM Token Management (consolidated)
  async updateFCMToken(fcmToken: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/fcm/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken }),
    });
  }

  async removeFCMToken(): Promise<ApiResponse<any>> {
    return this.makeRequest('/fcm/token', {
      method: 'DELETE',
    });
  }

  async debugTokenStatus(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/fcm/debug', {
      method: 'GET',
    });
  }

  // Holiday Management
  async getHolidays(month?: number, year?: number, forceRefresh?: boolean): Promise<ApiResponse<any[]>> {
    // Holidays barely change (long TTL) — cache the unfiltered list and apply
    // the same month/year filter client-side whether it came from cache or
    // network, matching the pre-existing behavior.
    const applyFilter = (all: any[]) => {
      let list = all;
      if (year) {
        const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-`;
        list = all.filter((h) => typeof h.date === 'string' && h.date.startsWith(prefix));
      }
      return list.map((h) => ({ ...h, title: h.name, name: h.name }));
    };

    if (!forceRefresh && (await isFresh('holidays', TTL.holidays))) {
      const cached = await getCachedHolidays();
      if (cached.length > 0) return { success: true, data: applyFilter(cached) };
    }

    // Real endpoint: GET /api/holidays → { success, holidays:[{_id,date,name}] }.
    const res = await this.makeRequest<any>('/holidays');
    if (!res.success) {
      return { success: false, error: res.error };
    }
    const all: any[] = (res.data && (res.data as any).holidays) || [];
    if (all.length > 0) {
      saveHolidays(all).catch((e) => console.warn('[db] saveHolidays failed:', e?.message));
      markSynced('holidays').catch(() => {});
    }
    return { success: true, data: applyFilter(all) };
  }

  // Detailed month calendar for the LOGGED-IN user — per-day check-in/out times,
  // absent days, government holidays, approved leave and WFH, plus a month summary.
  // Powers the dashboard's calendar-wise detailed report.
  //   month: 1-12, year: e.g. 2026. Both default server-side to the current month.
  async getMonthlyCalendar(month: number, year: number, forceRefresh?: boolean): Promise<ApiResponse<any>> {
    const periodKey = `calendar_${year}-${month}`;
    const ttlKey = `attendance_calendar:${periodKey}`;
    if (!forceRefresh && (await isFresh(ttlKey, TTL.calendar))) {
      const cached = await getCachedAttendanceStats(periodKey);
      if (cached) return { success: true, data: cached };
    }

    const response = await this.makeRequest<any>(`/attendance/calendar?month=${month}&year=${year}`, {
      method: 'GET',
    });
    if (response.success && response.data) {
      saveAttendanceStats(periodKey, response.data).catch((e) =>
        console.warn('[db] saveAttendanceStats (calendar) failed:', e?.message)
      );
      markSynced(ttlKey).catch(() => {});
      return response;
    }

    // Offline/server-unreachable — fall back to whatever this month last
    // looked like locally (even if stale) instead of a hard error and an
    // empty calendar. A real server error (e.g. 401/validation) with the
    // network up still returns response as-is since getCachedAttendanceStats
    // only has something to return once a successful fetch has happened.
    const stale = await getCachedAttendanceStats(periodKey);
    if (stale) return { success: true, data: stale };
    return response;
  }

  // Leave Balance Management
  // The real endpoint GET /api/leave-balances returns the whole org roster of
  // balances; pick out the logged-in employee's row by uid/id.
  private async findMyLeaveBalance(): Promise<any | null> {
    const res = await this.makeRequest<any>('/leave-balances');
    if (!res.success) return null;
    const balances: any[] = (res.data && (res.data as any).balances) || [];
    let me: any = null;
    try {
      const raw = await AsyncStorage.getItem('user');
      me = raw ? JSON.parse(raw) : null;
    } catch {
      me = null;
    }
    const uid = me?.uid;
    const id = me?.id;
    return (
      balances.find(
        (b) => (uid && String(b.uid) === String(uid)) || (id && String(b.id) === String(id))
      ) || null
    );
  }

  async getLeaveBalance(): Promise<ApiResponse<any>> {
    const mine = await this.findMyLeaveBalance();
    const quota = mine?.quota ?? 24;
    const used = mine?.used ?? 0;
    return {
      success: true,
      data: {
        combinedLeaveBalance: Math.max(0, quota - used),
        totalLeavesEarned: quota,
        totalLeavesUsed: used,
      },
    };
  }

  async getRemainingLeaves(): Promise<ApiResponse<any>> {
    const mine = await this.findMyLeaveBalance();
    const quota = mine?.quota ?? 24;
    const used = mine?.used ?? 0;
    return { success: true, data: { remaining: Math.max(0, quota - used) } };
  }

  async getLeaveBalanceByStudentId(studentId: string): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>(`/leaveBalance/student/${studentId}`, {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error fetching student leave balance:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch leave balance',
      };
    }
  }

  // Shift Schedule Management
  async getApplicableShifts(): Promise<ApiResponse<any[]>> {
    try {
      return this.makeRequest<any[]>('/shifts/applicable', {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error fetching applicable shifts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch shifts',
      };
    }
  }

  async getAllShifts(filters?: { department?: string; isActive?: boolean }): Promise<ApiResponse<any[]>> {
    try {
      const params = new URLSearchParams();
      if (filters?.department) params.append('department', filters.department);
      if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));

      const queryString = params.toString();
      const endpoint = queryString ? `/shifts?${queryString}` : '/shifts';

      return this.makeRequest<any[]>(endpoint, {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error fetching all shifts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch shifts',
      };
    }
  }

  async getShiftById(shiftId: string): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>(`/shifts/${shiftId}`, {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error fetching shift:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch shift',
      };
    }
  }

  async createShift(shiftData: {
    name: string;
    description?: string;
    shiftType?: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes?: number;
    applicableDays?: number[];
    applicableDepartments?: string[];
  }): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>('/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shiftData),
      });
    } catch (error) {
      console.error('Error creating shift:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create shift',
      };
    }
  }

  async updateShift(
    shiftId: string,
    shiftData: any
  ): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>(`/shifts/${shiftId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shiftData),
      });
    } catch (error) {
      console.error('Error updating shift:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update shift',
      };
    }
  }

  async deleteShift(shiftId: string): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>(`/shifts/${shiftId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting shift:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete shift',
      };
    }
  }

  async getShiftStudents(shiftId: string): Promise<ApiResponse<any[]>> {
    try {
      return this.makeRequest<any[]>(`/shifts/${shiftId}/students`, {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error fetching shift students:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch shift students',
      };
    }
  }

  // Liveness Challenge Management
  async getLivenessChallenge(): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>('/liveness/challenge', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error getting liveness challenge:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get liveness challenge',
      };
    }
  }

  async verifyLivenessChallenge(
    challengeId: string,
    results: Array<{
      action: string;
      passed: boolean;
      confidence: number;
    }>
  ): Promise<ApiResponse<any>> {
    try {
      return this.makeRequest<any>('/liveness/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challengeId,
          results,
        }),
      });
    } catch (error) {
      console.error('Error verifying liveness challenge:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify liveness challenge',
      };
    }
  }

  // ───────── SAACMS · Employee profile ─────────
  // Full employee profile (role / designation / department / organization).
  // Use this in the app — /auth/me returns only {success:true} for student tokens.
  async getPortalProfile(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/portal/me');
  }

  // ───────── SAACMS · Phase 2 · Teaching Log (Class Check-ins) ─────────
  // Faculty's own weekly timetable.
  // Response: { success, rows: [{ id, subject, type, day, start, end, room, academicYear }] }
  async getMyTimetable(forceRefresh?: boolean): Promise<ApiResponse<any>> {
    if (!forceRefresh && (await isFresh('timetable', TTL.timetable))) {
      const cached = await getCachedTimetableRows();
      if (cached.length > 0) return { success: true, data: { success: true, rows: cached } };
    }
    const response = await this.makeRequest<any>('/portal/my/timetable');
    const rows = response.success ? (response.data as any)?.rows : null;
    if (Array.isArray(rows) && rows.length > 0) {
      saveTimetableRows(rows).catch((e) => console.warn('[db] saveTimetableRows failed:', e?.message));
      markSynced('timetable').catch(() => {});
    }
    return response;
  }

  // Today's class-checkin log — used to seed each slot's ongoing/conducted state.
  // Response: { success, date, rows: [{ timetableId, checkinId, status, actualStart, actualEnd, ... }] }
  async getClassCheckinLog(date: string, forceRefresh?: boolean): Promise<ApiResponse<any>> {
    const ttlKey = `class_checkins:${date}`;
    if (!forceRefresh && (await isFresh(ttlKey, TTL.dailyOperational))) {
      const cached = await getCachedClassCheckinLog(date);
      if (cached) return { success: true, data: cached };
    }
    const response = await this.makeRequest<any>(`/class-checkins/log?date=${encodeURIComponent(date)}`);
    if (response.success && response.data) {
      saveClassCheckinLog(date, response.data).catch((e) => console.warn('[db] saveClassCheckinLog failed:', e?.message));
      markSynced(ttlKey).catch(() => {});
    }
    return response;
  }

  // Start or end a class. action 'start' → status 'ongoing'; 'end' → 'conducted'.
  // Photos are base64 data URIs in the photos:[{label,image}] shape.
  async classCheckin(payload: {
    timetableId: string;
    action: 'start' | 'end';
    date?: string;
    note?: string;
    headcount?: number;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    place?: string;
    photos?: Array<{ label: string; image: string }>;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/class-checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // ───────── SAACMS · Phase 4 · Outreach (OutreachActivity) ─────────
  // List outreach activities (HOD-scoped on the backend to dept leads).
  async getOutreach(forceRefresh?: boolean): Promise<ApiResponse<any>> {
    // OutreachScreen reads response.data.activities — the cache-hit response
    // must match that shape, not hand back a bare array (see the same class
    // of bug just fixed on getMySpotChecks).
    if (!forceRefresh && (await isFresh('outreach', TTL.outreach))) {
      const cached = await getCachedOutreachActivities();
      if (cached.length > 0) return { success: true, data: { success: true, activities: cached } };
    }
    const response = await this.makeRequest<any>('/outreach');
    if (response.success && response.data) {
      const records = extractRequestArray(response.data, ['activities', 'outreach']);
      if (records.length > 0) {
        saveOutreachActivities(records).catch((e) => console.warn('[db] saveOutreachActivities failed:', e?.message));
        markSynced('outreach').catch(() => {});
      }
    }
    return response;
  }

  // Create an outreach activity (lead defaults to caller; status starts pending).
  async createOutreach(payload: {
    title: string;
    type?: string;
    date?: string;
    location: string;
    participants?: number;
    gpsPoints?: number;
    photos?: Array<{ label: string; image: string }>;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Advance an activity (in_progress / completed) and attach evidence totals.
  async updateOutreachStatus(
    id: string,
    payload: {
      status: 'pending' | 'in_progress' | 'completed' | 'rejected';
      participants?: number;
      gpsPoints?: number;
      photoCount?: number;
      photos?: Array<{ label: string; image: string }>;
      rejectionReason?: string;
    }
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/outreach/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // ───────── Spot-checks (random attendance verification) ─────────
  // Open spot-checks for the signed-in user (drives the mandatory verify modal).
  async getPendingSpotChecks(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/spot-checks/pending');
  }

  // Submit a response after passing the live face/liveness flow. The server
  // is authoritative — faceImage + livenessNonce/Events are the actual
  // evidence it re-verifies (identity match, PAD, liveness adjudication);
  // any faceVerified/verificationScore/livenessVerdict the caller passes is
  // informational only and never trusted server-side.
  async respondToSpotCheck(
    id: string,
    payload: {
      latitude?: number;
      longitude?: number;
      distance?: number;
      faceImage?: any;
      /** Optional burst of frames for multi-frame anti-spoof. */
      faceImages?: any[];
      livenessNonce?: string | null;
      livenessEvents?: Array<Record<string, any>>;
      attestation?: Record<string, any>;
      deviceId?: string;
      deviceModel?: string;
      manufacturer?: string;
    }
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/spot-checks/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // The user's own spot-check history + stats (for the My Spot-Checks screen).
  // NOT the pending mandatory-verification check (see spotChecks route /
  // SpotCheckBanner) — that stays live/ungated on purpose.
  async getMySpotChecks(forceRefresh?: boolean): Promise<ApiResponse<any>> {
    if (!forceRefresh && (await isFresh('spot_check_history', TTL.spotCheckHistory))) {
      const cached = await getCachedSpotCheckHistory();
      if (cached) return { success: true, data: cached };
    }
    const response = await this.makeRequest<any>('/spot-checks/my');
    if (response.success && response.data) {
      saveSpotCheckHistory(response.data).catch((e) => console.warn('[db] saveSpotCheckHistory failed:', e?.message));
      markSynced('spot_check_history').catch(() => {});
    }
    return response;
  }

  // Geofence points the logged-in staff may mark from. For the shared campus
  // (Anuvadini / NETF / IUAC) this returns ALL THREE offices so the app can show
  // "in range" at any of them (a staff sent to a sister branch marks there
  // without a DB location change). The app checks distance to the NEAREST one.
  async getCampusOffices(): Promise<ApiResponse<{ campus: boolean; offices: Array<{ campus: string; name: string; latitude: number; longitude: number; radius: number }> }>> {
    try {
      return this.makeRequest('/attendance/campus-offices');
    } catch (error) {
      console.error('Error fetching campus offices:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch campus offices' };
    }
  }

  // ───────── Attendance Regularization ─────────
  async submitRegularizationRequest(formData: FormData): Promise<ApiResponse<any>> {
    try {
      const token = await this.getAuthToken();
      // Use direct fetch to bypass makeRequest's JSON Content-Type override
      // Fetch will automatically generate the correct Content-Type with boundary for FormData
      const response = await fetch(`${getApiBaseUrl()}/regularization`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error submitting regularization request:', error);
      return { success: false, error: 'Failed to submit regularization request' };
    }
  }

  async getMyRegularizationRequests(): Promise<ApiResponse<any>> {
    return this.makeRequest<any>('/regularization/my-requests');
  }

  // ───────── Compliance Memos (warnings issued by Anuvadini Super Admin) ─────────
  async getMyMemos(forceRefresh?: boolean): Promise<ApiResponse<any>> {
    // MemosScreen reads response.data.memos — must match on a cache hit too.
    if (!forceRefresh && (await isFresh('memos', TTL.memos))) {
      const cached = await getCachedMemos();
      if (cached.length > 0) return { success: true, data: { success: true, memos: cached } };
    }
    const response = await this.makeRequest<any>('/memos/my-memos');
    if (response.success && response.data) {
      const records = extractRequestArray(response.data, ['memos']);
      if (records.length > 0) {
        saveMemos(records).catch((e) => console.warn('[db] saveMemos failed:', e?.message));
        markSynced('memos').catch(() => {});
      }
    }
    return response;
  }

  async acknowledgeMemo(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/memos/${id}/acknowledge`, { method: 'POST' });
  }
}

export const apiService = new ApiService();
export default apiService;
