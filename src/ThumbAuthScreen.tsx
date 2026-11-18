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
  Fingerprint,
  Camera as CameraIcon,
  CameraOff,
  RefreshCw,
  ShieldCheck,
  ClipboardList,
  X,
} from 'lucide-react-native';
import { showToast } from './utils/toast';
import {
  Screen,
  AppHeader,
  Button,
  Card,
  useTheme,
} from './components/ui';
import type { AppTheme } from './components/ui';

export const ThumbAuthScreen: React.FC = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [hasPermission, setHasPermission] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [thumbImage, setThumbImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
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
      console.warn('ThumbAuthScreen: camera permission check failed:', e);
      setHasPermission(false);
    }
  };

  const captureThumbImage = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePhoto({
        enableAutoRedEyeReduction: true,
      });

      setThumbImage(`file://${photo.path}`);
      setShowCamera(false);
    } catch (error) {
      console.error('Capture error:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to capture image' });
    }
  };

  const submitThumbAuth = async () => {
    if (thumbImage === null || thumbImage === '') {
      showToast({
        type: 'warning',
        title: 'No image',
        message: 'Please capture a thumb image first',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Here you would send the thumb image to your backend
      // For demo purposes, we'll simulate the API call
      await simulateThumbVerification(thumbImage);
    } catch (error) {
      console.error('Thumb auth error:', error);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to process thumb authentication',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const simulateThumbVerification = (_imageUri: string) => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        showToast({
          type: 'success',
          title: 'Thumb verification',
          message: 'Thumb print authentication successful!',
        });
        navigation.navigate('Attendance' as never);
        resolve(true);
      }, 2000);
    });
  };

  const retakeImage = () => {
    setThumbImage(null);
  };

  return (
    <Screen scroll testID="thumb-auth-screen">
      <AppHeader title="Thumb Authentication" onBack={() => navigation.goBack()} />

      {/* Instructions */}
      <Animated.View entering={FadeInDown.duration(300)}>
        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <ClipboardList size={18} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>Instructions</Text>
          </View>
          <Text style={styles.instructionItem}>{'•'} Place your thumb on a clean, flat surface</Text>
          <Text style={styles.instructionItem}>{'•'} Ensure good lighting for clear visibility</Text>
          <Text style={styles.instructionItem}>{'•'} Keep your thumb still during capture</Text>
          <Text style={styles.instructionItem}>{'•'} Capture the thumb print clearly</Text>
        </Card>
      </Animated.View>

      {/* Thumb Image Preview */}
      <Animated.View entering={FadeInDown.duration(300).delay(50)}>
        <Card elevation={1} style={[styles.sectionCard, styles.centeredCard]}>
          <View style={styles.sectionTitleRow}>
            <Fingerprint size={18} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>Thumb Print Image</Text>
          </View>
          {thumbImage !== null && thumbImage !== '' ? (
            <View style={styles.imagePreview}>
              <Image
                source={{ uri: thumbImage }}
                style={styles.thumbImage}
                accessibilityLabel="Captured thumb print image"
              />
              <Button
                title="Retake"
                icon={RefreshCw}
                variant="outline"
                size="sm"
                onPress={retakeImage}
                accessibilityLabel="Retake thumb image"
                style={styles.retakeButton}
              />
            </View>
          ) : (
            <View style={styles.noImageContainer}>
              <Fingerprint size={56} color={theme.colors.textMuted} />
              <Text style={styles.noImageSubtext}>No thumb image captured</Text>
            </View>
          )}
        </Card>
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <CameraIcon size={18} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>Capture Thumb Print</Text>
          </View>
          <Button
            title="Take Photo"
            icon={CameraIcon}
            fullWidth
            onPress={() => setShowCamera(true)}
            disabled={!hasPermission}
            accessibilityLabel="Take photo of thumb print"
            testID="thumb-take-photo-button"
          />
        </Card>
      </Animated.View>

      {/* Submit Button */}
      <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.submitContainer}>
        <Button
          title="Verify Thumb Print"
          icon={ShieldCheck}
          size="lg"
          fullWidth
          onPress={submitThumbAuth}
          loading={isProcessing}
          disabled={thumbImage === null || thumbImage === '' || isProcessing}
          accessibilityLabel="Verify thumb print"
          accessibilityHint="Submits the captured thumb image for verification"
          testID="thumb-submit-button"
        />
      </Animated.View>

      {/* Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.cameraModal}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>Capture Thumb Print</Text>
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

              {/* Thumb Guide Overlay */}
              <View style={styles.thumbGuide} pointerEvents="none">
                <View style={styles.thumbFrame}>
                  <Text style={styles.thumbGuideText}>Place thumb here</Text>
                </View>
              </View>

              <View style={styles.cameraControls}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={captureThumbImage}
                  accessibilityRole="button"
                  accessibilityLabel="Capture thumb print photo"
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
    thumbImage: {
      width: 200,
      height: 200,
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
    thumbGuide: {
      position: 'absolute',
      top: '30%',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    thumbFrame: {
      width: 150,
      height: 200,
      borderWidth: 3,
      borderColor: colors.success,
      borderRadius: 75,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.successSoft,
    },
    thumbGuideText: {
      ...typography.label,
      color: colors.white,
      textAlign: 'center',
      backgroundColor: colors.overlay,
      padding: spacing.sm,
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
