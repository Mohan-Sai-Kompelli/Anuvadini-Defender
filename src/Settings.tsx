import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { View, Text, StyleSheet, Image, ScrollView, TextInput } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  CircleUser,
  CircleX,
  IdCard,
  LogOut,
  Mail,
  Smartphone,
  User,
  Wifi,
} from 'lucide-react-native';
import type { RootTabParamList } from "./navigation";
import { useAuth } from "./AuthContext";
import { apiService } from "./services/api";
import {
  Button,
  ConfirmSheet,
  EmptyState,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  useTheme,
} from './components/ui';
import { showToast } from './utils/toast';
import { getApiBaseUrl, getApiHost, setApiHost } from './config';

type Props = BottomTabScreenProps<RootTabParamList, "Profile">;

// A registered face photo can resolve to a dead link (e.g. a server-local
// upload path that didn't survive a redeploy, or a cached studentData blob
// saved before the server started filtering those out). Rather than showing
// a broken-image icon, just don't render that one thumbnail — the caption
// count below still reflects the raw array, but a silently-dropped broken
// photo is far less confusing than a visibly broken one.
const ProfileFaceThumb: React.FC<{
  uri: string;
  index: number;
  marginRight: number;
  borderColor: string;
}> = ({ uri, index, marginRight, borderColor }) => {
  const [errored, setErrored] = React.useState(false);
  if (errored) return null;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={`Registered face photo ${index + 1}`}
      onError={() => setErrored(true)}
      style={[styles.faceImage, { marginRight, borderColor }]}
    />
  );
};

export const Settings: React.FC<Props> = () => {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { colors, spacing, radii, typography, shadows } = theme;

  const [studentData, setStudentData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [signOutVisible, setSignOutVisible] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [hostInput, setHostInput] = React.useState(getApiHost());
  const [savingHost, setSavingHost] = React.useState(false);

  const fetchStudentDetails = React.useCallback(async () => {
    // 1) Hydrate instantly from cache so the screen renders immediately and
    //    never shows "could not load" when we already have data offline.
    let base: any = null;
    try {
      const cached = await AsyncStorage.getItem('studentData');
      if (cached) {
        base = JSON.parse(cached);
        setStudentData(base);
        setError(null);
        setLoading(false);
      }
    } catch {
      /* ignore bad cache */
    }

    if (!user?.id && !base) {
      setStudentData(null);
      setLoading(false);
      setError('No user id');
      return;
    }

    // 2) Refresh through apiService (same auth/base path as the rest of the app).
    //    /portal/me works for student tokens; /get-student-details carries the
    //    enrolled faceImages. Run both in parallel; either failing is fine.
    try {
      const [portalR, detailsR] = await Promise.allSettled([
        apiService.getPortalProfile(),
        user?.id ? apiService.getStudentDetails(user.id) : Promise.resolve({ success: false } as any),
      ]);

      const portalVal: any = portalR.status === 'fulfilled' ? portalR.value : null;
      const detailsVal: any = detailsR.status === 'fulfilled' ? detailsR.value : null;
      const portal = portalVal?.success ? (portalVal.data?.profile ?? portalVal.data) : null;
      const details = detailsVal?.success ? detailsVal.data : null;

      const merged: any = { ...(base || {}), ...(portal || {}), ...(details || {}) };
      const hasData =
        merged &&
        (merged.fullName ||
          merged.uid ||
          merged.email ||
          (Array.isArray(merged.faceImages) && merged.faceImages.length > 0));

      if (hasData) {
        setStudentData(merged);
        setError(null);
        try {
          await AsyncStorage.setItem('studentData', JSON.stringify(merged));
        } catch {
          /* best-effort cache */
        }
      } else if (!base) {
        setStudentData(null);
        setError('Could not load profile');
      }
    } catch (err: any) {
      console.warn('Fetch student details error:', err);
      // Keep whatever we hydrated from cache; only error if we have nothing.
      if (!base) {
        setStudentData(null);
        setError(err?.message ?? 'Failed to fetch');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchStudentDetails();
  }, [fetchStudentDetails]);

  const buildImageUri = (img: any) => {
    if (!img || typeof img !== "string") return null;
    // Already a data URI (registered faces are stored base64) or absolute URL.
    if (img.startsWith("data:")) return img;
    if (img.startsWith("http://") || img.startsWith("https://")) return img;
    // Raw base64 blob (no data: prefix) — wrap it so <Image> can render it.
    if (img.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(img)) {
      return `data:image/jpeg;base64,${img.replace(/\s/g, "")}`;
    }
    // Otherwise treat as a server-relative path.
    const path = img.startsWith("/") ? img.slice(1) : img;
    const host = getApiHost().replace(/\/+$/, '');
    const origin = /^https?:\/\//i.test(host) ? host : `http://${host}`;
    return `${origin}/${path}`;
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await logout();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Sign out failed',
        message: err?.message ?? 'Please try again.',
      });
    } finally {
      setSigningOut(false);
      setSignOutVisible(false);
    }
  };

  const sectionCardStyle = [
    shadows.e2,
    styles.sectionCard,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.xl,
      marginBottom: spacing.lg,
    },
  ];

  const handleSaveHost = async () => {
    const next = hostInput.trim();
    setSavingHost(true);
    try {
      await setApiHost(next);
      setHostInput(getApiHost());
      showToast({ type: 'success', title: 'Backend updated', message: getApiBaseUrl() });
      fetchStudentDetails();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not update host', message: err?.message ?? 'Please try again.' });
    } finally {
      setSavingHost(false);
    }
  };

  const handleResetHost = async () => {
    setSavingHost(true);
    try {
      await setApiHost('');
      setHostInput(getApiHost());
      showToast({ type: 'success', title: 'Reset to default', message: getApiBaseUrl() });
      fetchStudentDetails();
    } finally {
      setSavingHost(false);
    }
  };

  // Backend host editor — rendered both on the normal profile screen AND on the
  // error screen, because a wrong host is the most common reason the profile
  // fails to load, and that's exactly when the user needs to fix it.
  const renderConnection = () => (
    <>
      <SectionHeader title="Backend Connection" icon={Wifi} />
      <Animated.View
        entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
        style={sectionCardStyle}
      >
        <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.md }]}>
          The server host:port this app talks to. Change it if the backend moved to a new IP, then reconnect.
        </Text>
        <TextInput
          value={hostInput}
          onChangeText={setHostInput}
          placeholder="172.23.43.193:5001"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!savingHost}
          style={[
            typography.body,
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              borderRadius: radii.md,
              padding: spacing.md,
              color: colors.text,
              backgroundColor: colors.surfaceAlt,
              marginBottom: spacing.md,
            },
          ]}
        />
        <Button
          title={savingHost ? 'Reconnecting…' : 'Save & Reconnect'}
          icon={Wifi}
          fullWidth
          loading={savingHost}
          onPress={handleSaveHost}
          accessibilityLabel="Save backend host and reconnect"
        />
        <Button
          title="Reset to default"
          variant="outline"
          fullWidth
          onPress={handleResetHost}
          accessibilityLabel="Reset backend host to default"
          style={{ marginTop: spacing.sm }}
        />
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          Current: {getApiBaseUrl()}
        </Text>
      </Animated.View>
    </>
  );

  const detailRow = (icon: React.ReactNode, label: string, value: any, bold?: boolean) => (
    <View style={[styles.detailRow, { marginBottom: spacing.lg }]}>
      <View style={[styles.detailIcon, { marginRight: spacing.md }]}>{icon}</View>
      <Text style={[typography.label, styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          bold ? typography.bodyBold : typography.body,
          styles.detailValue,
          { color: colors.text },
        ]}
      >
        {value ?? "-"}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <Screen testID="profile-loading" edges={['left', 'right']}>
        <View style={styles.skeletonHeader}>
          <Skeleton width={96} height={96} radius={48} />
        </View>
        <SkeletonCard lines={4} style={{ marginTop: spacing.xl }} />
        <SkeletonCard lines={2} style={{ marginTop: spacing.lg }} />
        <SkeletonCard lines={3} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  if (error || !studentData) {
    return (
      <Screen scroll padded testID="profile-error" edges={['left', 'right']}>
        <EmptyState
          icon={CircleX}
          title={error ? 'Could not load profile' : 'No profile data available'}
          message={error ?? 'Pull to refresh or try again.'}
          actionLabel="Try Again"
          onAction={fetchStudentDetails}
        />
        {renderConnection()}
        <Button
          title="Sign Out"
          variant="danger"
          icon={LogOut}
          fullWidth
          onPress={() => setSignOutVisible(true)}
          accessibilityLabel="Sign out of your account"
          style={{ marginTop: spacing.xl }}
        />
        <ConfirmSheet
          visible={signOutVisible}
          title="Sign out?"
          message="You will need to log in again to mark attendance."
          confirmLabel="Sign Out"
          cancelLabel="Cancel"
          destructive
          loading={signingOut}
          icon={LogOut}
          onConfirm={handleSignOut}
          onCancel={() => setSignOutVisible(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded testID="profile-screen" edges={['left', 'right']}>
      {/* Identity card */}
      <Animated.View
        entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
        style={[sectionCardStyle, styles.identityCard]}
      >
        {Array.isArray(studentData?.faceImages) && studentData.faceImages.length > 0 ? (
          <View style={{ width: '100%', marginBottom: spacing.lg }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.xs }}
            >
              {studentData.faceImages.map((img: string, idx: number) => {
                const uri = buildImageUri(img);
                if (!uri) return null;
                return (
                  <ProfileFaceThumb
                    key={idx}
                    uri={uri}
                    index={idx}
                    marginRight={spacing.md}
                    borderColor={colors.brand}
                  />
                );
              })}
            </ScrollView>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
              {studentData.faceImages.length} registered face photo{studentData.faceImages.length > 1 ? 's' : ''}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                marginBottom: spacing.lg,
              },
            ]}
            accessible
            accessibilityLabel="No profile photos"
          >
            <CircleUser size={56} color={colors.textMuted} strokeWidth={1.5} />
          </View>
        )}

        <Text style={[typography.h2, { color: colors.text }]}>
          {studentData.fullName ?? user?.name ?? 'Employee'}
        </Text>
        {studentData.email ? (
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs }]}>
            {studentData.email}
          </Text>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.xl }]} />

        <View style={styles.detailsBlock}>
          {detailRow(<User size={16} color={colors.brand} strokeWidth={2} />, 'Full Name', studentData.fullName, true)}
          {detailRow(<IdCard size={16} color={colors.brand} strokeWidth={2} />, 'UID', studentData.uid)}
          {detailRow(<User size={16} color={colors.brand} strokeWidth={2} />, 'Age', studentData.age)}
          {detailRow(<User size={16} color={colors.brand} strokeWidth={2} />, 'Gender', studentData.gender)}
          {detailRow(<Mail size={16} color={colors.brand} strokeWidth={2} />, 'Email', studentData.email)}
          {detailRow(
            <Smartphone size={16} color={colors.brand} strokeWidth={2} />,
            'Mobile Number',
            studentData?.phone ||
              studentData?.mobile ||
              studentData?.phoneNumber ||
              studentData?.contactNumber ||
              (user as any)?.phone ||
              (user as any)?.mobile ||
              studentData?.uid ||
              user?.id ||
              '-'
          )}
        </View>
      </Animated.View>

      {/* Sign out */}
      <Animated.View
        entering={FadeInDown.duration(300).delay(150).reduceMotion(ReduceMotion.System)}
        style={{ marginTop: spacing.sm, marginBottom: spacing.xxl }}
      >
        <Button
          title="Sign Out"
          variant="danger"
          icon={LogOut}
          fullWidth
          onPress={() => setSignOutVisible(true)}
          accessibilityLabel="Sign out of your account"
        />
      </Animated.View>

      <ConfirmSheet
        visible={signOutVisible}
        title="Sign out?"
        message="You will need to log in again to mark attendance."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        destructive
        loading={signingOut}
        icon={LogOut}
        onConfirm={handleSignOut}
        onCancel={() => setSignOutVisible(false)}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  sectionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  identityCard: {
    alignItems: 'center',
  },
  faceImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  detailsBlock: {
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    width: 20,
    alignItems: 'center',
  },
  detailLabel: {
    flex: 1,
  },
  detailValue: {
    flex: 1.4,
    textAlign: 'right',
  },
  skeletonHeader: {
    alignItems: 'center',
  },
});

export default Settings;
