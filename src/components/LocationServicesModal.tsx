import React from 'react';
import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPin, RefreshCw } from 'lucide-react-native';

/**
 * Polite in-app prompt shown when device Location Services are turned OFF.
 *
 * This exists specifically so the app never tries to trigger the native
 * Play-Services "turn on location" resolution dialog itself (that flow needs a
 * ready foreground Activity and throws a non-JS exception — uncatchable from
 * React Native — if it fires too early, e.g. right after login/app boot,
 * which is what was crashing the app outright instead of showing a prompt).
 * Every location call now runs with `showLocationDialog: false`, and callers
 * show this modal instead when the resulting error indicates location is off.
 */
export const LocationServicesModal: React.FC<{
  visible: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
}> = ({ visible, onRetry, onDismiss }) => {
  const openLocationSettings = () => {
    try {
      if (Platform.OS === 'android') {
        Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
          Linking.openSettings().catch(() => {});
        });
      } else {
        Linking.openURL('App-Prefs:root=Privacy&path=LOCATION').catch(() => {
          Linking.openSettings().catch(() => {});
        });
      }
    } catch {
      Linking.openSettings().catch(() => {});
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MapPin size={26} color="#2C9E83" />
          </View>
          <Text style={styles.title}>Turn on Location</Text>
          <Text style={styles.body}>
            Your device's location services are switched off. Please turn them
            on so we can verify where you're checking in from.
          </Text>

          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openLocationSettings}>
            <Text style={styles.btnPrimaryText}>Open Location Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onRetry}>
            <RefreshCw size={15} color="#2C9E83" />
            <Text style={styles.btnGhostText}>I've turned it on — Retry</Text>
          </TouchableOpacity>

          {onDismiss ? (
            <TouchableOpacity style={styles.dismiss} onPress={onDismiss}>
              <Text style={styles.dismissText}>Not now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

export default LocationServicesModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, alignItems: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(44,158,131,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  body: { fontSize: 13.5, color: '#475569', textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, width: '100%' },
  btnPrimary: { backgroundColor: '#2C9E83' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  btnGhost: { borderWidth: 1, borderColor: '#2C9E83', backgroundColor: 'rgba(44,158,131,0.06)', marginTop: 10 },
  btnGhostText: { color: '#2C9E83', fontWeight: '700', fontSize: 14 },
  dismiss: { marginTop: 14, paddingVertical: 4 },
  dismissText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
