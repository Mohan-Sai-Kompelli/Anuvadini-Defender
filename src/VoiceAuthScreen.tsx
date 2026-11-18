import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Mic,
  MicOff,
  Square,
  Play,
  RefreshCw,
  FileText,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { useAuth } from './AuthContext';
import { showToast } from './utils/toast';
import { getApiBaseUrl } from './config';
import {
  Screen,
  AppHeader,
  Button,
  Card,
  EmptyState,
  useTheme,
} from './components/ui';
import type { AppTheme } from './components/ui';
// import RNFS from 'react-native-fs';

const dummyTexts = [
  'The quick brown fox jumps over the lazy dog',
  'My voice is my passport verify me',
  'Authentication using voice recognition technology',
  'Secure access through vocal biometric identification',
  'Voice authentication provides enhanced security measures',
];

export const VoiceAuthScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [hasPermission, setHasPermission] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00');
  const [currentText, setCurrentText] = useState(dummyTexts[0]);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordingTimer] = useState<NodeJS.Timeout | null>(null);
  const recorderRef = React.useRef(new AudioRecorderPlayer());
  const recordPathRef = React.useRef<string | null>(null);
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    requestPermissions();
    generateRandomText();

    // Cleanup timer on unmount
    return () => {
      if (recordingTimer) {
        clearInterval(recordingTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingTimer]);

  const generateRandomText = () => {
    const randomIndex = Math.floor(Math.random() * dummyTexts.length);
    setCurrentText(dummyTexts[randomIndex]);
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        if (grants['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(true);
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      setHasPermission(true);
    }
  };

  // const startRecording = async () => {
  //   if (!hasPermission || isRecording) return;
  //
  //   // choose a path you own
  //   // const path = `${RNFS.DocumentDirectoryPath}/voiceAuth_${Date.now()}.m4a`;
  //   // recordPathRef.current = path;
  //
  //   setIsRecording(true);
  //   setHasRecording(false);
  //   setRecordTime('00:00');
  //
  //   await recorderRef.current.startRecorder(path);
  //   // (optional) add a progress listener instead of your interval timer
  // };

  const stopRecording = async () => {
    if (!isRecording || isStopping) return;
    setIsStopping(true);

    try {
      await recorderRef.current.stopRecorder();
      recorderRef.current.removeRecordBackListener?.();

      // use the path we set at start time
      const path = recordPathRef.current;
      if (!path) throw new Error('No record path stored');

      // verify file exists
      // const exists = await RNFS.exists(path);
      // if (!exists) throw new Error('Recorded file missing on disk');

      setRecordedFilePath(path);
      setHasRecording(true);
    } finally {
      setIsRecording(false);
      setIsStopping(false);
    }
  };

  const submitVoiceAuth = async () => {
    if (!recordedFilePath) {
      showToast({
        type: 'warning',
        title: 'No recording',
        message: 'Please record your voice first',
      });
      return;
    }
    setIsProcessing(true);
    try {
      const token = await getAuthToken();

      // build a proper file:// URI
      let uri = recordedFilePath;
      if (!uri.startsWith('file://')) uri = `file://${uri}`;

      // one last sanity check
      // await RNFS.stat(uri.replace('file://', ''));
      const userId2 = user?.role === 'student' ? user.id : undefined;

      const fd = new FormData();
      fd.append('audioFile', {
        uri,
        name: 'voiceAuth.m4a',
        type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
      } as any);
      fd.append('textSpoken', currentText);
      fd.append('recordingDuration', recordTime);
      fd.append('userId', userId2 as any);
      console.log('fd', fd);

      const res = await fetch(`${getApiBaseUrl()}/voice-auth`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // no Content-Type; RN sets correct boundary
        },
        body: fd, // the same FormData you builtss
      });
      console.log(res, 'result');
      const result = await res.json();
      if (result.success) {
        showToast({
          type: 'success',
          title: 'Voice verification',
          message: 'Voice authentication successful!',
        });
        navigation.navigate('Attendance' as never);
      } else {
        showToast({
          type: 'error',
          title: 'Voice verification failed',
          message: result.message ? result.message : 'Voice recognition failed. Please try again.',
        });
        setHasRecording(false);
        setRecordTime('00:00');
        generateRandomText();
      }
    } catch (e) {
      console.log('upload path:', recordedFilePath);
      console.error('Voice auth error:', e);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to process voice authentication. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getAuthToken = async () => {
    try {
      // Get token from AsyncStorage or your auth context
      const token = await AsyncStorage.getItem('userToken');
      return token;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  };

  if (!hasPermission) {
    return (
      <Screen testID="voice-auth-no-permission">
        <AppHeader title="Voice Authentication" onBack={() => navigation.goBack()} />
        <EmptyState
          icon={MicOff}
          title="Microphone permission required"
          message="Microphone access is needed for voice authentication."
          actionLabel="Grant Permission"
          onAction={requestPermissions}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll testID="voice-auth-screen">
      <AppHeader
        title="Voice Authentication"
        onBack={() => navigation.goBack()}
        rightIcon={RefreshCw}
        onRightPress={generateRandomText}
        rightAccessibilityLabel="Generate new text to read"
      />

      {/* Text to Read */}
      <Animated.View entering={FadeInDown.duration(300)}>
        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <FileText size={18} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>Please read the following text</Text>
          </View>
          <View style={styles.textBox}>
            <Text style={styles.dummyText}>{currentText}</Text>
          </View>
          <Button
            title="Generate New Text"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onPress={generateRandomText}
            accessibilityLabel="Generate new text to read"
            style={styles.newTextButton}
          />
        </Card>
      </Animated.View>

      {/* Recording Controls */}
      <Animated.View entering={FadeInDown.duration(300).delay(50)}>
        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.recordingStatus}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isRecording ? theme.colors.danger : theme.colors.textMuted },
                ]}
              />
              <Text style={styles.statusText} accessibilityLiveRegion="polite">
                {isRecording ? 'Recording...' : 'Ready to Record'}
              </Text>
            </View>
            <Text style={styles.timeText}>{recordTime}</Text>
          </View>

          <View style={styles.controls}>
            <Button
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
              icon={isRecording ? Square : Mic}
              variant={isRecording ? 'secondary' : 'danger'}
              fullWidth
              // Original start-recording handler is disabled upstream; stop still works.
              // onPress={isRecording ? stopRecording : startRecording}
              onPress={() => {
                if (isRecording) {
                  stopRecording();
                }
              }}
              disabled={isProcessing}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
              testID="voice-record-button"
            />

            {hasRecording && !isRecording && (
              <Button
                title="Play Recording"
                icon={Play}
                variant="outline"
                fullWidth
                onPress={() =>
                  showToast({
                    type: 'info',
                    title: 'Demo',
                    message: 'Play recording feature - audio playback simulation',
                  })
                }
                disabled={isProcessing}
                accessibilityLabel="Play recording"
              />
            )}
          </View>
        </Card>
      </Animated.View>

      {/* Instructions */}
      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <ClipboardList size={18} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>Instructions</Text>
          </View>
          <Text style={styles.instructionItem}>{'•'} Read the text clearly and naturally</Text>
          <Text style={styles.instructionItem}>{'•'} Speak in a quiet environment</Text>
          <Text style={styles.instructionItem}>{'•'} Hold the device close to your mouth</Text>
          <Text style={styles.instructionItem}>{'•'} Record for at least 3-5 seconds</Text>
        </Card>
      </Animated.View>

      {/* Submit Button */}
      <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.submitContainer}>
        <Button
          title="Verify Voice"
          icon={ShieldCheck}
          size="lg"
          fullWidth
          onPress={() => submitVoiceAuth()}
          loading={isProcessing}
          disabled={!hasRecording || isRecording || isProcessing}
          accessibilityLabel="Verify voice"
          accessibilityHint="Submits your recording for voice verification"
          testID="voice-submit-button"
        />
      </Animated.View>
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
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      ...typography.title,
      color: colors.text,
      flex: 1,
    },
    textBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radii.sm,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    dummyText: {
      ...typography.body,
      fontSize: theme.fontSizes.lg,
      lineHeight: theme.lineHeights.lg,
      color: colors.text,
      textAlign: 'center',
    },
    newTextButton: {
      alignSelf: 'center',
    },
    recordingStatus: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: radii.pill,
    },
    statusText: {
      ...typography.title,
      color: colors.text,
    },
    timeText: {
      ...typography.h2,
      color: colors.brand,
    },
    controls: {
      gap: spacing.md,
    },
    instructionItem: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    submitContainer: {
      padding: spacing.lg,
    },
  });
};
