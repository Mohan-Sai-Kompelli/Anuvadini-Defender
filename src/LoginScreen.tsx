import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  ArrowLeft,
  BadgeCheck,
  Lock,
  ScanFace,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import type { StudentLookupResponse } from './services/api';
import {
  Button,
  GlassBackdrop,
  GlassCard,
  Input,
  Screen,
  useTheme,
} from './components/ui';
import { showToast } from './utils/toast';
import { haptic } from './utils/haptics';
import { Footer } from './components/Footer';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

export const LoginScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing, radii, typography } = theme;
  const insets = useSafeAreaInsets();

  const [uid, setUid] = useState('');
  const [password, setPassword] = useState('');
  const [uidError, setUidError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(
    undefined,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [studentData, setStudentData] = useState<
    StudentLookupResponse['student'] | null
  >(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { studentLogin, isLoading, setOrganization } = useAuth();

  const uidInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // autoFocus alone is unreliable here — the field mounts inside GlassCard's
  // entering animation (FadeIn), and on Android the keyboard often doesn't
  // come up if focus() is called before that layout settles. A short delay
  // plus an explicit ref.focus() call is the standard workaround.
  useEffect(() => {
    const t = setTimeout(() => uidInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showPasswordInput) return;
    const t = setTimeout(() => passwordInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showPasswordInput]);

  const handleUIDLookup = async () => {
    if (uid.trim() === '') {
      setUidError('Please enter your UID');
      return;
    }
    setUidError(undefined);

    try {
      setIsLookingUp(true);
      console.log('Looking up student with UID:', uid);
      console.log('Making request to API...');

      const result = await apiService.lookupStudentByUID(uid);

      console.log('API Response:', JSON.stringify(result, null, 2));

      if (result.success && result.data) {
        console.log('Student found:', result.data);
        // Extract student data from the nested structure
        const lookedUpStudent = result.data.student;
        setStudentData(lookedUpStudent);
        setShowPasswordInput(true);
        haptic('success');

        // Store organization data for later use
        if (lookedUpStudent?.organization) {
          await AsyncStorage.setItem(
            'organizationData',
            JSON.stringify(lookedUpStudent?.organization),
          );
          setOrganization(lookedUpStudent?.organization);
        }
      } else {
        let errorMsg = result.error || 'Employee not found with this UID';
        if (/student/i.test(errorMsg)) {
          errorMsg = errorMsg.replace(/student/gi, 'Employee');
        }
        if (/network/i.test(errorMsg) || /failed to fetch/i.test(errorMsg)) {
          errorMsg = 'No internet connection';
        }
        console.error('Lookup failed:', errorMsg);
        haptic('error');
        setUidError(errorMsg);
        showToast({
          type: 'error',
          title: errorMsg === 'No internet connection' ? 'No Internet' : 'Employee not found',
          message: errorMsg,
        });
      }
    } catch (error) {
      console.error('UID lookup error:', error);
      const raw = error instanceof Error ? error.message : String(error);
      const errorMessage = (/network/i.test(raw) || /failed to fetch/i.test(raw))
        ? 'No internet connection'
        : 'Employee not found with this UID';
      haptic('error');
      setUidError(errorMessage);
      showToast({
        type: 'error',
        title: errorMessage === 'No internet connection' ? 'No Internet' : 'Lookup failed',
        message: errorMessage,
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLogin = async () => {
    if (password.trim() === '') {
      setPasswordError('Please enter your password');
      return;
    }
    setPasswordError(undefined);

    if (!studentData) {
      showToast({
        type: 'warning',
        title: 'Lookup required',
        message: 'Please look up your UID first',
      });
      return;
    }

    try {
      setIsProcessing(true);
      console.log('Attempting student login...');

      // Use the studentLogin function from AuthContext instead of direct API call
      const result = await studentLogin(uid, password);

      if (result.success) {
        console.log('Student login successful');
        // The AuthContext handles navigation; the app redirects automatically.
      } else {
        haptic('error');
        let userFacingError = result.error || 'Incorrect password. Please check your password and try again.';
        if (/invalid uid or password/i.test(userFacingError) || /invalid password/i.test(userFacingError)) {
          userFacingError = 'Incorrect password. Please check your password and try again.';
        }
        setPasswordError(userFacingError);
        showToast({
          type: 'error',
          title: 'Incorrect Password',
          message: userFacingError,
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      haptic('error');
      setPasswordError('Something went wrong. Please try again.');
      showToast({
        type: 'error',
        title: 'Something went wrong',
        message: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setUid('');
    setPassword('');
    setUidError(undefined);
    setPasswordError(undefined);
    setStudentData(null);
    setShowPasswordInput(false);
  };

  if (showForgotPassword) {
    return (
      <ForgotPasswordScreen
        initialUid={uid}
        onBack={() => setShowForgotPassword(false)}
      />
    );
  }

  const infoRows: Array<{ label: string; value?: string }> = studentData
    ? [
        { label: 'Name', value: studentData.fullName },
        { label: 'UID', value: studentData.uid },
        { label: 'Organization', value: studentData?.organization?.name },
        {
          label: 'Type',
          value: studentData?.organization?.organizationType,
        },
      ]
    : [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* Immersive gradient + glow backdrop (Skia, no extra deps) */}
      <GlassBackdrop variant="brand" />

      <Screen
        scroll
        keyboardAvoiding
        padded={false}
        edges={['left', 'right']}
        contentContainerStyle={styles.scrollContent}
        style={styles.transparent}
        testID="login-screen"
      >
        {/* Hero header on the gradient */}
        <Animated.View
          entering={FadeInUp.duration(500)}
          style={[
            styles.hero,
            { paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.xl },
          ]}
        >
          <View
            style={[
              styles.brandChip,
              {
                backgroundColor: colors.glassFill,
                borderColor: colors.glassBorder,
                borderRadius: radii.xl,
              },
            ]}
          >
            <ScanFace size={36} color={colors.onGradient} />
          </View>
          <Text style={[typography.h1, { color: colors.onGradient, marginTop: spacing.lg }]}>
            Biometric Attendance
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.onGradientMuted, marginTop: spacing.sm, textAlign: 'center' },
            ]}
          >
            Secure, live face verification with geo-fencing
          </Text>
        </Animated.View>

        {/* Glass login card */}
        <GlassCard
          tint="strong"
          enteringIndex={1}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.xxl }}
        >
          {showPasswordInput ? (
            <Button
              title="Back"
              variant="ghost"
              size="sm"
              icon={ArrowLeft}
              onPress={resetForm}
              accessibilityLabel="Go back and change UID"
              accessibilityHint="Clears the form and returns to UID entry"
              style={styles.backButton}
            />
          ) : null}

          <Text style={[typography.h3, { color: colors.text }]}>Employee Login</Text>
          <Text
            style={[
              typography.small,
              { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
            ]}
            accessibilityLiveRegion="polite"
          >
            {showPasswordInput
              ? 'Confirm your details and enter your password'
              : 'Enter your UID to continue'}
          </Text>

          {studentData ? (
            <Animated.View
              entering={FadeInDown.duration(300).delay(50)}
              accessibilityLiveRegion="polite"
              style={[
                styles.infoPanel,
                {
                  backgroundColor: colors.brandSoft,
                  borderRadius: radii.lg,
                  padding: spacing.lg,
                  marginBottom: spacing.lg,
                },
              ]}
            >
              <View style={[styles.infoHeader, { marginBottom: spacing.md }]}>
                <BadgeCheck size={18} color={colors.brand} />
                <Text
                  style={[typography.bodyBold, { color: colors.brandStrong, marginLeft: spacing.sm }]}
                >
                  Employee verified
                </Text>
              </View>
              {infoRows.map(row => (
                <View key={row.label} style={[styles.infoRow, { marginBottom: spacing.xs }]}>
                  <Text
                    style={[typography.caption, styles.infoLabel, { color: colors.textMuted }]}
                  >
                    {row.label}
                  </Text>
                  <Text style={[typography.body, styles.infoValue, { color: colors.text }]}>
                    {row.value ?? '—'}
                  </Text>
                </View>
              ))}
            </Animated.View>
          ) : null}

          <Input
            ref={uidInputRef}
            label="Employee UID"
            icon={User}
            placeholder="Enter your UID"
            value={uid}
            onChangeText={text => {
              setUid(text);
              if (uidError) setUidError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!showPasswordInput}
            error={uidError}
            returnKeyType="go"
            onSubmitEditing={showPasswordInput ? undefined : handleUIDLookup}
            testID="login-uid-input"
            // Keyboard opens the moment this screen mounts so the user can
            // start typing the UID without tapping the field first.
            autoFocus={!showPasswordInput}
          />

          {!showPasswordInput ? (
            <Button
              title="Continue"
              onPress={handleUIDLookup}
              loading={isLookingUp}
              fullWidth
              accessibilityLabel="Continue with UID"
              testID="login-continue-button"
            />
          ) : (
            <>
              <Input
                ref={passwordInputRef}
                label="Password"
                icon={Lock}
                placeholder="Enter your password"
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  if (passwordError) setPasswordError(undefined);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                error={passwordError}
                helperText="First-time login? Use your UID as the password."
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                testID="login-password-input"
                // This field only mounts once the UID lookup succeeds, so
                // autoFocus here fires exactly when the password step appears.
                autoFocus
              />
              <Button
                title="Login"
                onPress={handleLogin}
                loading={isLoading || isProcessing}
                fullWidth
                accessibilityLabel="Login"
                testID="login-submit-button"
              />
              <Button
                title="Forgot password?"
                variant="ghost"
                size="sm"
                onPress={() => setShowForgotPassword(true)}
                style={styles.forgotButton}
                accessibilityLabel="Forgot password"
                testID="login-forgot-password-button"
              />
            </>
          )}
        </GlassCard>

        {/* Secure note on the gradient */}
        <Animated.View
          entering={FadeIn.duration(400).delay(250)}
          style={[styles.secureNote, { marginTop: spacing.xl, paddingHorizontal: spacing.xl }]}
        >
          <ShieldCheck size={14} color={colors.onGradientMuted} />
          <Text style={[typography.caption, { color: colors.onGradientMuted, marginLeft: spacing.xs }]}>
            End-to-End Secure · Live Anti-Spoof Check
          </Text>
        </Animated.View>

        <View style={styles.flexSpacer} />

        <Footer />
      </Screen>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  hero: {
    alignItems: 'center',
  },
  brandChip: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 4,
  },
  infoPanel: {
    alignSelf: 'stretch',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    width: 96,
  },
  infoValue: {
    flex: 1,
  },
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexSpacer: {
    flex: 1,
    minHeight: 16,
  },
});
