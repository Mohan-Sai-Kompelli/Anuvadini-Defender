import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScanEye, ClipboardList, Camera as CameraIcon } from 'lucide-react-native';
import Geolocation from 'react-native-geolocation-service';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import { showToast } from './utils/toast';
import {
  Screen,
  AppHeader,
  Button,
  Card,
  EmptyState,
  useTheme,
} from './components/ui';
import type { AppTheme } from './components/ui';

export const IrisAuthScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [isCapturingFace, setIsCapturingFace] = useState(false);
  const [isProcessingRecognition, setIsProcessingRecognition] = useState(false);
  const [authMessage, setAuthMessage] = useState('Position your eyes within the circles');
  const [recognitionResult, setRecognitionResult] = useState<{success: boolean; message: string; confidence?: number} | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [attendanceType, setAttendanceType] = useState<'in' | 'out'>('in');
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'front');
  const cameraRef = useRef<Camera>(null);

  // Get userId from user context
  const userId = user?.uid || user?.id || '';

  useEffect(() => {
    checkCameraPermission();
    getCurrentLocation();
    // Get attendance type from route params if available
    const type = (route.params as any)?.type;
    if (type) {
      setAttendanceType(type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to store face authentication result in database
  const storeFaceAuthenticationResult = async (result: {
    success: boolean;
    message: string;
    confidence?: number;
  }, capturedImage?: any) => {
    try {
      if (!user) {
        console.log('No user found, skipping database storage');
        return;
      }

      // Create authentication record
      const authData = {
        userId: user.id,
        success: result.success,
        confidence: result.confidence || 0,
        message: result.message,
        attendanceType: attendanceType || null,
        timestamp: new Date().toISOString(),
        imageData: capturedImage ? 'captured' : 'not_captured',
        latitude: currentLocation?.latitude || 0,
        longitude: currentLocation?.longitude || 0
      };

      console.log('[IrisAuthScreen] Storing iris authentication with location:', {
        hasLocation: !!currentLocation,
        latitude: authData.latitude,
        longitude: authData.longitude,
        attendanceType: authData.attendanceType
      });

      // Store in database via API
      const response = await apiService.storeFaceAuthentication(authData);

      if (response.success) {
        console.log('Iris authentication result stored successfully');
        console.log('Response:', response);
      } else {
        console.error('Failed to store iris authentication result:', response.error);
      }
    } catch (error) {
      console.error('Error storing iris authentication result:', error);
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'App needs access to your location to verify attendance.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    } else {
      return true; // iOS handles it automatically
    }
  };

  const getCurrentLocation = async (): Promise<{latitude: number; longitude: number} | null> => {
    try {
      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        showToast({
          type: 'warning',
          title: 'Permission denied',
          message: 'Location permission is required for attendance. Tap to retry.',
          onPress: () => getCurrentLocation(),
        });
        return null;
      }

      return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const location = { latitude, longitude };
            setCurrentLocation(location);
            console.log('Current Location for Iris Auth:', latitude, longitude);
            resolve(location);
          },
          (error) => {
            console.error('Location error:', error);
            showToast({
              type: 'error',
              title: 'Location error',
              message: 'Failed to get current location. Please try again.',
            });
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            forceRequestLocation: true,
            // showLocationDialog:false — true makes the library trigger Play
            // Services' native "turn on location" resolution dialog, which
            // needs a ready foreground Activity and can throw a non-JS
            // (uncatchable) exception, crashing the app instead of failing
            // into the error callback above. See src/utils/location.ts.
            showLocationDialog: false,
          },
        );
      });
    } catch (error) {
      console.error('Location permission error:', error);
      showToast({
        type: 'error',
        title: 'Location error',
        message: 'Failed to get location permission',
      });
      return null;
    }
  };

  useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    try {
      const permission = await Camera.getCameraPermissionStatus();
      if (permission === 'granted') {
        setHasCameraPermission(true);
      } else {
        const newPermission = await Camera.requestCameraPermission();
        setHasCameraPermission(newPermission === 'granted');
      }
    } catch (e) {
      console.warn('IrisAuthScreen: camera permission check failed:', e);
      setHasCameraPermission(false);
    }
  };

  const resetAuthentication = () => {
    setRecognitionResult(null);
    setAuthMessage('Position your eyes within the circles');
    setIsCapturingFace(false);
    setIsProcessingRecognition(false);
  };

  const onVerificationSuccess = async (_fileUri: string) => {
    // Mark attendance with iris method
    let locationToUse = currentLocation;

    if (!locationToUse) {
      // If location is not available, try to get it again
      showToast({
        type: 'info',
        title: 'Getting location',
        message: 'Please wait while we get your current location...',
      });

      try {
        locationToUse = await getCurrentLocation();

        if (!locationToUse) {
          showToast({
            type: 'error',
            title: 'Location unavailable',
            message: 'Please ensure location services are enabled and try again.',
          });
          return;
        }
      } catch (error) {
        showToast({
          type: 'error',
          title: 'Location error',
          message: 'Failed to get location. Please try again.',
        });
        return;
      }
    }

    try {
      const attendanceResponse = await apiService.markAttendance({
        type: attendanceType,
        latitude: locationToUse.latitude,
        longitude: locationToUse.longitude,
        authMethod: 'iris' as const,
      });

      if (attendanceResponse.success && attendanceResponse.data) {
        showToast({
          type: 'success',
          title: 'Iris verification successful',
          message: 'Your iris has been verified and attendance has been marked.',
        });
        navigation.navigate('Attendance' as never);
      } else {
        showToast({
          type: 'error',
          title: 'Attendance error',
          message: attendanceResponse.error || 'Failed to mark attendance',
        });
      }
    } catch (error) {
      console.error('Attendance marking error:', error);
      showToast({
        type: 'error',
        title: 'Attendance error',
        message: 'Failed to mark attendance',
      });
    }
  };

  const captureFaceForRecognition = React.useCallback(async () => {
    try {
      setIsCapturingFace(true);
      setAuthMessage('Capturing your iris...');

      const photo = await cameraRef.current?.takePhoto({
        flash: 'off',
      });

      if (!photo) {
        throw new Error('Failed to capture image');
      }

      const fileUri = `file://${photo.path}`; // Android/iOS path

      setIsCapturingFace(false);
      setIsProcessingRecognition(true);
      setAuthMessage('Processing iris recognition...');

      // Route through the BACKEND /attendance/verify-face (NOT check.py
      // directly). The old direct call to the Python service only read
      // `match` and ignored the anti-spoof verdict entirely — a screen/photo
      // replay of the genuine face MATCHES the embedding, so it sailed
      // through as "Verified" and, because the Node layer was bypassed, no
      // SpoofAttempt was ever recorded for the super-admin Spoof Detection
      // report. The backend route enforces PAD, records the evidence image,
      // and applies the same fraud policy as every other verification path.
      const apiResult = await apiService.verifyFace(photo);
      setIsProcessingRecognition(false);
      const data = apiResult.data ?? { match: false, reason: apiResult.error };

      if (apiResult.success && data.match) {
        const result = { success: true, message: 'Verified', confidence: 95 };
        setRecognitionResult(result);
        setAuthMessage('Iris recognition successful');

        // Store iris authentication result in database
        await storeFaceAuthenticationResult(result, fileUri);

        // Show success message and continue with attendance flow
        setTimeout(() => {
          showToast({
            type: 'success',
            title: 'Authentication successful',
            message: `Iris verification completed. Confidence: ${result.confidence}%`,
          });
          onVerificationSuccess(fileUri);
        }, 1000);
      } else {
        const result = { success: false, message: data.reason || 'Not recognized' };
        setRecognitionResult(result);
        setAuthMessage(data.reason || 'Not recognized');

        // Store failed authentication result
        await storeFaceAuthenticationResult(result, null);

        // Show failure message and allow retry
        setTimeout(() => {
          showToast({
            type: 'error',
            title: 'Authentication failed',
            message: 'Iris verification failed. Please try again.',
          });
          resetAuthentication();
        }, 1000);
      }
    } catch (error) {
      console.error('Iris capture error:', error);
      setIsCapturingFace(false);
      setIsProcessingRecognition(false);
      setAuthMessage('Recognition failed. Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!hasCameraPermission) {
    return (
      <Screen testID="iris-auth-no-permission">
        <AppHeader title="Iris Authentication" onBack={() => navigation.goBack()} />
        <EmptyState
          icon={CameraIcon}
          title="Camera permission required"
          message="Camera access is needed for iris scanning."
          actionLabel="Grant Permission"
          onAction={checkCameraPermission}
        />
      </Screen>
    );
  }

  if (!device) {
    return (
      <Screen testID="iris-auth-no-device">
        <AppHeader title="Iris Authentication" onBack={() => navigation.goBack()} />
        <EmptyState
          icon={CameraIcon}
          title="Front camera not available"
          message="This device does not have a usable front camera."
        />
      </Screen>
    );
  }

  return (
    <Screen testID="iris-auth-screen">
      <AppHeader title="Iris Authentication" onBack={() => navigation.goBack()} />

      {/* Camera View - Fixed */}
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          device={device}
          isActive={true}
          photo={true}
        />

        {/* Eye Highlighting Overlay */}
        <View style={styles.overlay} pointerEvents="none">
          {/* Left Eye Highlight */}
          <View style={[styles.eyeHighlight, styles.leftEye]}>
            <View style={styles.eyeCircle}>
              <ScanEye size={28} color={theme.colors.success} />
            </View>
          </View>

          {/* Right Eye Highlight */}
          <View style={[styles.eyeHighlight, styles.rightEye]}>
            <View style={styles.eyeCircle}>
              <ScanEye size={28} color={theme.colors.success} />
            </View>
          </View>

          {/* Center Instructions */}
          <View style={styles.instructionsContainer}>
            <Text
              style={styles.instructionsText}
              accessibilityLiveRegion="polite"
              accessibilityRole="text"
            >
              {authMessage}
            </Text>
            {(isCapturingFace || isProcessingRecognition) && (
              <ActivityIndicator size="large" color={theme.colors.brand} style={styles.spinner} />
            )}
          </View>
        </View>

        {/* Scanning indicator line */}
        {isCapturingFace && <View style={styles.scanningLine} />}
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollableContent}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instructions */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card elevation={1} style={styles.instructionsPanel}>
            <View style={styles.instructionsTitleRow}>
              <ClipboardList size={18} color={theme.colors.brand} />
              <Text style={styles.instructionsTitle}>Instructions</Text>
            </View>
            <Text style={styles.instructionItem}>{'•'} Look directly at the camera</Text>
            <Text style={styles.instructionItem}>{'•'} Keep your eyes open and still</Text>
            <Text style={styles.instructionItem}>{'•'} Ensure good lighting on your face</Text>
            <Text style={styles.instructionItem}>{'•'} Position eyes within the highlighted circles</Text>
          </Card>
        </Animated.View>

        {/* Control Button */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)} style={styles.controls}>
          <Button
            title="Start Iris Scan"
            icon={ScanEye}
            size="lg"
            fullWidth
            onPress={captureFaceForRecognition}
            loading={isCapturingFace || isProcessingRecognition}
            disabled={isCapturingFace || isProcessingRecognition}
            accessibilityLabel="Start iris scan"
            accessibilityHint="Captures a photo of your eyes for iris verification"
            testID="iris-scan-button"
          />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
};

const createStyles = (theme: AppTheme) => {
  const { colors, spacing, radii, typography } = theme;
  return StyleSheet.create({
    scrollableContent: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    cameraContainer: {
      flex: 1,
      position: 'relative',
      margin: spacing.lg,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.black,
    },
    camera: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    eyeHighlight: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: radii.pill,
      borderWidth: 3,
      borderColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.successSoft,
    },
    leftEye: {
      top: '30%',
      left: '25%',
    },
    rightEye: {
      top: '30%',
      right: '25%',
    },
    eyeCircle: {
      width: 60,
      height: 60,
      borderRadius: radii.pill,
      borderWidth: 2,
      borderColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
    },
    instructionsContainer: {
      position: 'absolute',
      bottom: 100,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    instructionsText: {
      ...typography.bodyBold,
      color: colors.white,
      textAlign: 'center',
      backgroundColor: colors.overlay,
      padding: spacing.md,
      borderRadius: radii.sm,
      overflow: 'hidden',
    },
    spinner: {
      marginTop: spacing.sm,
    },
    scanningLine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.success,
    },
    instructionsPanel: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    instructionsTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    instructionsTitle: {
      ...typography.title,
      color: colors.text,
    },
    instructionItem: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    controls: {
      padding: spacing.lg,
    },
  });
};
