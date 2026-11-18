import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, KeyRound, Lock, MailCheck, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from './services/api';
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

type Step = 'uid' | 'otp';

export const ForgotPasswordScreen: React.FC<{ onBack: () => void; initialUid?: string }> = ({
  onBack,
  initialUid = '',
}) => {
  const { theme } = useTheme();
  const { colors, spacing, radii, typography } = theme;
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('uid');
  const [uid, setUid] = useState(initialUid);
  const [uidError, setUidError] = useState<string | undefined>(undefined);
  const [maskedEmail, setMaskedEmail] = useState('');

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpError, setOtpError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);

  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const uidInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => uidInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step !== 'otp') return;
    const t = setTimeout(() => otpInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [step]);

  const handleSendOtp = async () => {
    if (uid.trim() === '') {
      setUidError('Please enter your UID');
      return;
    }
    setUidError(undefined);

    try {
      setIsSendingOtp(true);
      const result = await apiService.forgotPassword(uid.trim());

      if (result.success && result.data) {
        haptic('success');
        setMaskedEmail(result.data.maskedEmail);
        setStep('otp');
        showToast({
          type: 'success',
          title: 'Code sent',
          message: `A verification code was sent to ${result.data.maskedEmail}`,
        });
      } else {
        haptic('error');
        const errorMsg = result.error || 'Could not send verification code';
        setUidError(errorMsg);
        showToast({ type: 'error', title: 'Request failed', message: errorMsg });
      }
    } catch (error) {
      haptic('error');
      const message = error instanceof Error ? error.message : 'Something went wrong';
      setUidError(message);
      showToast({ type: 'error', title: 'Request failed', message });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResetPassword = async () => {
    let hasError = false;
    if (otp.trim().length !== 6) {
      setOtpError('Enter the 6-digit code');
      hasError = true;
    } else {
      setOtpError(undefined);
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      hasError = true;
    } else {
      setPasswordError(undefined);
    }
    if (hasError) return;

    try {
      setIsResetting(true);
      const result = await apiService.resetPassword(uid.trim(), otp.trim(), newPassword);

      if (result.success) {
        haptic('success');
        showToast({
          type: 'success',
          title: 'Password reset',
          message: 'Your password has been reset. Please log in.',
        });
        onBack();
      } else {
        haptic('error');
        const errorMsg = result.error || 'Could not reset password';
        setOtpError(errorMsg);
        showToast({ type: 'error', title: 'Reset failed', message: errorMsg });
      }
    } catch (error) {
      haptic('error');
      const message = error instanceof Error ? error.message : 'Something went wrong';
      setOtpError(message);
      showToast({ type: 'error', title: 'Reset failed', message });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <GlassBackdrop variant="brand" />

      <Screen
        scroll
        keyboardAvoiding
        padded={false}
        edges={['left', 'right']}
        contentContainerStyle={styles.scrollContent}
        style={styles.transparent}
        testID="forgot-password-screen"
      >
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
            <KeyRound size={36} color={colors.onGradient} />
          </View>
          <Text style={[typography.h1, { color: colors.onGradient, marginTop: spacing.lg }]}>
            Reset Password
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.onGradientMuted, marginTop: spacing.sm, textAlign: 'center' },
            ]}
          >
            {step === 'uid'
              ? 'Enter your UID to receive a verification code'
              : `Enter the code sent to ${maskedEmail}`}
          </Text>
        </Animated.View>

        <GlassCard
          tint="strong"
          enteringIndex={1}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.xxl }}
        >
          <Button
            title="Back to Login"
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onPress={onBack}
            accessibilityLabel="Back to login"
            style={styles.backButton}
          />

          {step === 'uid' ? (
            <>
              <Text style={[typography.h3, { color: colors.text }]}>Forgot Password</Text>
              <Text
                style={[
                  typography.small,
                  { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
                ]}
              >
                We&apos;ll email a verification code to your registered address
              </Text>

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
                error={uidError}
                returnKeyType="go"
                onSubmitEditing={handleSendOtp}
                testID="forgot-uid-input"
                autoFocus
              />

              <Button
                title="Send Code"
                onPress={handleSendOtp}
                loading={isSendingOtp}
                fullWidth
                accessibilityLabel="Send verification code"
                testID="forgot-send-code-button"
              />
            </>
          ) : (
            <>
              <View style={[styles.infoHeader, { marginBottom: spacing.lg }]}>
                <MailCheck size={18} color={colors.brand} />
                <Text
                  style={[typography.bodyBold, { color: colors.brandStrong, marginLeft: spacing.sm }]}
                >
                  Code sent to {maskedEmail}
                </Text>
              </View>

              <Input
                ref={otpInputRef}
                label="Verification Code"
                icon={KeyRound}
                placeholder="6-digit code"
                value={otp}
                onChangeText={text => {
                  setOtp(text.replace(/[^0-9]/g, '').slice(0, 6));
                  if (otpError) setOtpError(undefined);
                }}
                keyboardType="number-pad"
                maxLength={6}
                error={otpError}
                testID="forgot-otp-input"
              />

              <Input
                label="New Password"
                icon={Lock}
                placeholder="Enter new password"
                value={newPassword}
                onChangeText={text => {
                  setNewPassword(text);
                  if (passwordError) setPasswordError(undefined);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                testID="forgot-new-password-input"
              />

              <Input
                label="Confirm Password"
                icon={Lock}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChangeText={text => {
                  setConfirmPassword(text);
                  if (passwordError) setPasswordError(undefined);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                error={passwordError}
                returnKeyType="go"
                onSubmitEditing={handleResetPassword}
                testID="forgot-confirm-password-input"
              />

              <Button
                title="Reset Password"
                onPress={handleResetPassword}
                loading={isResetting}
                fullWidth
                accessibilityLabel="Reset password"
                testID="forgot-reset-button"
              />

              <Button
                title="Resend code"
                variant="ghost"
                size="sm"
                onPress={handleSendOtp}
                loading={isSendingOtp}
                style={styles.resendButton}
                accessibilityLabel="Resend verification code"
                testID="forgot-resend-button"
              />
            </>
          )}
        </GlassCard>

        <View style={styles.flexSpacer} />
      </Screen>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  scrollContent: { flexGrow: 1, paddingBottom: 0 },
  hero: { alignItems: 'center' },
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
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 4,
  },
  flexSpacer: {
    flex: 1,
    minHeight: 16,
  },
});
