import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Hand,
  Camera as CameraIcon,
  CameraOff,
  RefreshCw,
  ShieldCheck,
  ClipboardList,
  X,
} from 'lucide-react-native';
import Geolocation from 'react-native-geolocation-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './services/api';
import { showToast } from './utils/toast';
import {
  Screen,
  AppHeader,
  Button,
  Card,
  useTheme,
} from './components/ui';
import type { AppTheme } from './components/ui';

export const PalmAuthScreen: React.FC = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [hasPermission, setHasPermission] = useState(false);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>('');
  const [isProcessingRecognition, setIsProcessingRecognition] = useState(false);
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back');
  const cameraRef = useRef<Camera>(null);

  React.useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    try {
      const permission = await Camera.getCameraPermissionStatus();
      if (permission === 'granted') {
        setHasPermission(true);
      } else {
        const newPermission = await Camera.requestCameraPermission();
        setHasPermission(newPermission === 'granted');
      }
    } catch (e) {
      console.warn('PalmAuthScreen: camera permission check failed:', e);
      setHasPermission(false);
    }
  };

  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Location error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
          // showLocationDialog defaults to true when omitted — that triggers
          // Play Services' native "turn on location" dialog, which can throw
          // a non-JS (uncatchable) exception and crash the app. See
          // src/utils/location.ts for the full explanation.
          showLocationDialog: false,
        }
      );
    });
  };

  const capturePalmForRecognition = async () => {
    if (!palmImage) {
      showToast({
        type: 'warning',
        title: 'No image',
        message: 'Please capture a palm image first',
      });
      return;
    }

    setIsProcessingRecognition(true);
    setAuthMessage('Verifying palm...');

    try {
      // Get user data
      const userData = await AsyncStorage.getItem('user');
      if (!userData) {
        throw new Error('User data not found. Please login again.');
      }

      const user = JSON.parse(userData);
      const userId = user.id || user.uid;

      if (!userId) {
        throw new Error('User ID not found. Please login again.');
      }

      // Get location
      const location = await getCurrentLocation();

      // Prepare image for API
      const imageData = {
        uri: palmImage,
        name: 'palm.jpg',
        type: 'image/jpeg',
      };

      console.log('Starting palm verification with:', {
        userId,
        latitude: location.latitude,
        longitude: location.longitude,
      });

      // Call palm verification API
      const response = await apiService.verifyPalm(
        imageData,
        userId,
        location.latitude,
        location.longitude
      );

      console.log('Palm verification response:', response);

      if (response.success && response.data) {
        setAuthMessage('Palm authentication successful!');

        showToast({
          type: 'success',
          title: 'Palm authentication successful',
          message: 'Your attendance has been marked successfully.',
        });
        navigation.navigate('Attendance' as never);
      } else {
        setAuthMessage('Palm authentication failed');
        showToast({
          type: 'error',
          title: 'Authentication failed',
          message: response.error || 'Palm verification failed. Please try again.',
        });
      }
    } catch (error) {
      console.error('Palm recognition error:', error);
      setAuthMessage('Authentication error');

      let errorMessage = 'An error occurred during palm authentication.';
      if (error instanceof Error) {
        if (error.message.includes('Location')) {
          errorMessage = 'Unable to get your location. Please check location permissions and try again.';
        } else if (error.message.includes('User')) {
          errorMessage = 'User authentication failed. Please login again.';
        } else {
          errorMessage = error.message;
        }
      }

      showToast({ type: 'error', title: 'Error', message: errorMessage });
    } finally {
      setIsProcessingRecognition(false);
    }
  };

  const capturePalmImage = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePhoto({
        enableAutoRedEyeReduction: true,
      });

      setPalmImage(`file://${photo.path}`);
      setShowCamera(false);
    } catch (error) {
      console.error('Capture error:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to capture image' });
    }
  };

  const submitPalmAuth = async () => {
    if (palmImage === null || palmImage === '') {
      showToast({
        type: 'warning',
        title: 'No image',
        message: 'Please capture a palm image first',
      });
      return;
    }

    await capturePalmForRecognition();
  };

  const retakeImage = () => {
    setPalmImage(null);
  };

  return (
    <Screen testID="palm-auth-screen">
      <AppHeader title="Palm Authentication" onBack={() => navigation.goBack()} />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instructions */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ClipboardList size={18} color={theme.colors.brand} />
              <Text style={styles.sectionTitle}>Instructions</Text>
            </View>
            <Text style={styles.instructionItem}>{'•'} Hold your palm flat and open</Text>
            <Text style={styles.instructionItem}>{'•'} Ensure good lighting for clear visibility</Text>
            <Text style={styles.instructionItem}>{'•'} Keep your hand steady during capture</Text>
            <Text style={styles.instructionItem}>{'•'} Position palm within the frame guide</Text>
            <Text style={styles.instructionItem}>{'•'} Fingers should be slightly spread apart</Text>
          </Card>
        </Animated.View>

        {/* Palm Image Preview */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)}>
          <Card elevation={1} style={[styles.sectionCard, styles.centeredCard]}>
            <View style={styles.sectionTitleRow}>
              <Hand size={18} color={theme.colors.brand} />
              <Text style={styles.sectionTitle}>Palm Image</Text>
            </View>
            {palmImage !== null && palmImage !== '' ? (
              <View style={styles.imagePreview}>
                <Image
                  source={{ uri: palmImage }}
                  style={styles.palmImage}
                  accessibilityLabel="Captured palm image"
                />
                <Button
                  title="Retake"
                  icon={RefreshCw}
                  variant="outline"
                  size="sm"
                  onPress={retakeImage}
                  accessibilityLabel="Retake palm image"
                  style={styles.retakeButton}
                />
              </View>
            ) : (
              <View style={styles.noImageContainer}>
                <Hand size={56} color={theme.colors.textMuted} />
                <Text style={styles.noImageSubtext}>No palm image captured</Text>
              </View>
            )}
            {authMessage !== '' && (
              <Text style={styles.authMessage} accessibilityLiveRegion="polite">
                {authMessage}
              </Text>
            )}
          </Card>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)}>
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <CameraIcon size={18} color={theme.colors.brand} />
              <Text style={styles.sectionTitle}>Capture Palm</Text>
            </View>
            <Button
              title="Take Photo"
              icon={CameraIcon}
              fullWidth
              onPress={() => setShowCamera(true)}
              disabled={!hasPermission}
              accessibilityLabel="Take photo of palm"
              testID="palm-take-photo-button"
            />
          </Card>
        </Animated.View>

        {/* Submit Button */}
        <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.submitContainer}>
          <Button
            title="Verify Palm"
            icon={ShieldCheck}
            size="lg"
            fullWidth
            onPress={submitPalmAuth}
            loading={isProcessingRecognition}
            disabled={palmImage === null || palmImage === '' || isProcessingRecognition}
            accessibilityLabel="Verify palm"
            accessibilityHint="Submits the captured palm image for verification"
            testID="palm-submit-button"
          />
        </Animated.View>
      </Animated.ScrollView>

      {/* Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.cameraModal}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>Capture Palm</Text>
            <TouchableOpacity
              onPress={() => setShowCamera(false)}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>

          {device && hasPermission ? (
            <View style={styles.cameraContainer}>
              <Camera
                ref={cameraRef}
                style={styles.camera}
                device={device}
                isActive={showCamera}
                photo={true}
              />

              {/* Palm Guide Overlay */}
              <View style={styles.palmGuide} pointerEvents="none">
                <View style={styles.palmFrame}>
                  <Text style={styles.palmGuideText}>Position your palm here</Text>
                  <Text style={styles.palmSubtext}>Keep fingers slightly spread</Text>
                </View>
              </View>

              <View style={styles.cameraControls}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={capturePalmImage}
                  accessibilityRole="button"
                  accessibilityLabel="Capture palm photo"
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noCamera}>
              <CameraOff size={48} color={theme.colors.white} />
              <Text style={styles.noCameraText}>Camera not available</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
};

const createStyles = (theme: AppTheme) => {
  const { colors, spacing, radii, typography } = theme;
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    sectionCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    centeredCard: {
      alignItems: 'center',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
      alignSelf: 'stretch',
    },
    sectionTitle: {
      ...typography.title,
      color: colors.text,
      flex: 1,
    },
    instructionItem: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    imagePreview: {
      alignItems: 'center',
    },
    palmImage: {
      width: 200,
      height: 250,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    retakeButton: {
      marginTop: spacing.md,
    },
    noImageContainer: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      gap: spacing.md,
    },
    noImageSubtext: {
      ...typography.body,
      color: colors.textMuted,
    },
    authMessage: {
      ...typography.bodyBold,
      color: colors.brand,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    submitContainer: {
      padding: spacing.lg,
    },
    cameraModal: {
      flex: 1,
      backgroundColor: colors.black,
    },
    cameraHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      backgroundColor: colors.overlay,
    },
    cameraTitle: {
      ...typography.title,
      color: colors.white,
    },
    closeButton: {
      padding: spacing.sm,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraContainer: {
      flex: 1,
      position: 'relative',
    },
    camera: {
      flex: 1,
    },
    palmGuide: {
      position: 'absolute',
      top: '20%',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    palmFrame: {
      width: 200,
      height: 250,
      borderWidth: 3,
      borderColor: colors.success,
      borderRadius: radii.xl,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.successSoft,
      padding: spacing.lg,
    },
    palmGuideText: {
      ...typography.bodyBold,
      color: colors.white,
      textAlign: 'center',
      backgroundColor: colors.overlay,
      padding: spacing.sm,
      borderRadius: radii.sm,
      overflow: 'hidden',
      marginBottom: spacing.sm,
    },
    palmSubtext: {
      ...typography.caption,
      color: colors.white,
      textAlign: 'center',
      backgroundColor: colors.overlay,
      padding: spacing.xs,
      borderRadius: radii.sm,
      overflow: 'hidden',
    },
    cameraControls: {
      position: 'absolute',
      bottom: 50,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    captureButton: {
      width: 80,
      height: 80,
      borderRadius: radii.pill,
      backgroundColor: colors.white,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 4,
      borderColor: colors.brand,
    },
    captureButtonInner: {
      width: 60,
      height: 60,
      borderRadius: radii.pill,
      backgroundColor: colors.brand,
    },
    noCamera: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    noCameraText: {
      ...typography.title,
      color: colors.white,
    },
  });
};
