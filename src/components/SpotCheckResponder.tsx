import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { LivenessChallenge } from './LivenessChallenge';
import { apiService } from '../services/api';
import { spotCheckEvents } from '../services/spotCheckEvents';
import { requestLocationPermission, getCurrentPositionDetailed } from '../utils/location';
import { collectAttestation } from '../utils/attestation';
import { collectDeviceTelemetry } from '../utils/deviceTelemetry';

/**
 * Global, always-mounted responder for random spot-checks (SAACMS Module 6).
 *
 * A spot-check arrives as an FCM `spot_check` data message, but rather than rely
 * solely on push delivery + navigation, this component polls
 * GET /api/spot-checks/pending whenever the app becomes active (and when the
 * push handler nudges it via spotCheckEvents). When a pending spot-check exists
 * it runs the same liveness challenge used for attendance, then submits the
 * response to POST /api/spot-checks/:id/respond — forwarding the ACTUAL
 * captured face image + liveness nonce/events (never a client-side "it
 * passed" claim), so the server re-verifies identity + anti-spoof + liveness
 * itself, exactly like /attendance/mark.
 */
export const SpotCheckResponder: React.FC = () => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);

  const checkingRef = useRef(false);
  const activeRef = useRef<string | null>(null);
  // Spot-check ids we've already responded to this session. A responded check is
  // marked 'responded' server-side, but an immediate /pending read can still see
  // it as 'pending' (read-after-write replica lag on Atlas) — without this guard
  // that stale row instantly RE-OPENS the modal after a successful verify, so it
  // "never leaves the screen" until a manual refresh. Skipping handled ids makes
  // the dismissal reliable regardless of replication timing.
  const handledIdsRef = useRef<Set<string>>(new Set());
  // How far this device's clock is from the server's (serverNow - Date.now()),
  // refreshed on every /pending poll. A real phone's system clock is
  // frequently wrong/drifted (no NTP sync, manual date, etc.) — comparing
  // `sc.expiresAt` (an absolute server timestamp) against this device's OWN
  // Date.now() then misjudges a check that genuinely expired server-side as
  // "still open", so when it correctly drops off /pending the code below
  // wrongly concluded "handled on another device" instead of "time ran out".
  // `nowServer()` corrects for that drift everywhere below.
  const clockOffsetRef = useRef(0);
  const nowServer = useCallback(() => Date.now() + clockOffsetRef.current, []);

  const clearActive = useCallback(() => {
    activeRef.current = null;
    setActiveId(null);
    setLocation(null);
    setDeadline(null);
  }, []);

  const checkPending = useCallback(async () => {
    // Don't poll while already handling a spot-check or mid-fetch.
    if (checkingRef.current || activeRef.current) return;
    checkingRef.current = true;
    try {
      const res = await apiService.getPendingSpotChecks();
      if (res.success && (res.data as any)?.serverNow) {
        clockOffsetRef.current = new Date((res.data as any).serverNow).getTime() - Date.now();
      }
      const list: any[] = res.success ? res.data?.spotChecks || [] : [];
      // Skip any check we've already responded to (see handledIdsRef) — a stale
      // 'pending' row must never re-open a check the user just completed.
      const sc = list.find((x) => !handledIdsRef.current.has(String(x._id)));
      if (!sc) return;

      // Best-effort geo fix to attach to the response.
      let loc: { latitude: number; longitude: number } | null = null;
      try {
        const granted = await requestLocationPermission();
        if (granted) {
          const g = await getCurrentPositionDetailed();
          loc = { latitude: g.latitude, longitude: g.longitude };
        }
      } catch {
        // proceed without geo
      }

      activeRef.current = String(sc._id);
      setLocation(loc);
      setDeadline(sc.expiresAt ? new Date(sc.expiresAt).getTime() : null);
      setActiveId(String(sc._id));
    } catch (e) {
      console.warn('[SpotCheckResponder] checkPending failed:', e);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkPending();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') checkPending();
    });
    const unsub = spotCheckEvents.subscribe(() => checkPending());
    return () => {
      sub.remove();
      unsub();
    };
  }, [checkPending]);

  // Auto-close when the verification window expires; the server marks it missed.
  useEffect(() => {
    if (!activeId || !deadline) return;
    const ms = deadline - nowServer();
    if (ms <= 0) { clearActive(); return; }
    const t = setTimeout(() => {
      clearActive();
      spotCheckEvents.notify();
      Alert.alert('Spot-check window closed', 'You did not verify in time — it has been recorded as not done.');
    }, ms);
    return () => clearTimeout(t);
  }, [activeId, deadline, clearActive, nowServer]);

  const handleVerified = useCallback(async (
    faceImage?: any,
    evidence?: { nonce: string | null; events: Array<Record<string, any>> }
  ): Promise<boolean> => {
    const id = activeRef.current;
    if (!id) return false;
    let success = false;
    try {
      let attestation: Record<string, any> | undefined;
      try {
        attestation = await collectAttestation();
      } catch {
        /* non-fatal — never block a real response on attestation */
      }
      let deviceTelemetry: { deviceId?: string; deviceModel?: string; manufacturer?: string } = {};
      try {
        deviceTelemetry = await collectDeviceTelemetry();
      } catch {
        /* non-fatal */
      }
      const isBurst = Array.isArray(faceImage);
      const res = await apiService.respondToSpotCheck(id, {
        latitude: location?.latitude,
        longitude: location?.longitude,
        faceImage: isBurst ? faceImage[0] : faceImage,
        faceImages: isBurst ? faceImage : undefined,
        livenessNonce: evidence?.nonce ?? null,
        livenessEvents: evidence?.events ?? [],
        attestation,
        deviceId: deviceTelemetry.deviceId,
        deviceModel: deviceTelemetry.deviceModel,
        manufacturer: deviceTelemetry.manufacturer,
      });
      success = !!res.success;
      if (res.success) {
        handledIdsRef.current.add(String(id));
        const marked = (res.data as any)?.attendanceMarked;
        Alert.alert(
          'Spot-check verified',
          marked
            ? 'Verified — your attendance has been marked for today.'
            : 'Verified — your presence has been recorded.'
        );
      } else {
        Alert.alert('Spot-check', res.error || 'Could not record your response.');
      }
    } finally {
      if (success) {
        setTimeout(() => {
          clearActive();
          spotCheckEvents.notify();
          checkPending();
        }, 900);
      }
    }
    return success;
  }, [location, clearActive, checkPending]);

  const handleCancel = useCallback(() => {
    // Leave it pending server-side; it will be recorded as missed when it expires.
    clearActive();
  }, [clearActive]);

  return (
    <LivenessChallenge
      visible={!!activeId}
      attendanceType="spotcheck"
      currentLocation={location}
      mandatory
      deadline={deadline ?? undefined}
      onVerified={handleVerified}
      onCancel={handleCancel}
    />
  );
};

export default SpotCheckResponder;
