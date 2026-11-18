import React from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPinOff, RefreshCw } from 'lucide-react-native';

/**
 * Shown when the OS-level location permission is denied/revoked (e.g. via
 * Settings > App info > Permissions > Location > Don't allow). The rest of the
 * app (header, cards, nav) stays mounted and usable behind this — only
 * check-in is unavailable until permission is granted, same as when outside
 * the geofence. This never blocks app startup; see LiveLocationService's own
 * permission guard for why the app used to crash outright in this case.
 */
export const LocationPermissionModal: React.FC<{
  visible: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
}> = ({ visible, onRetry, onDismiss }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss || (() => {})}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MapPinOff size={26} color="#DC2626" />
        </View>
        <Text style={styles.title}>You're not providing location permission</Text>
        <Text style={styles.body}>
          Location access is required to check in. Please allow location
          permission for this app in Settings.
        </Text>

        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => Linking.openSettings().catch(() => {})}>
          <Text style={styles.btnPrimaryText}>Open App Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onRetry}>
          <RefreshCw size={15} color="#2C9E83" />
          <Text style={styles.btnGhostText}>I've allowed it — Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default LocationPermissionModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, alignItems: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(220,38,38,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6, textAlign: 'center' },
  body: { fontSize: 13.5, color: '#475569', textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, width: '100%' },
  btnPrimary: { backgroundColor: '#2C9E83' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  btnGhost: { borderWidth: 1, borderColor: '#2C9E83', backgroundColor: 'rgba(44,158,131,0.06)', marginTop: 10 },
  btnGhostText: { color: '#2C9E83', fontWeight: '700', fontSize: 14 },
});
