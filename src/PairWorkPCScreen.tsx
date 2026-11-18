// "Scan Work PC" — links an employee's work computer to their account by
// scanning the QR shown by the Anuvadini Defender desktop app (WhatsApp-Web
// style). On a successful scan the backend binds that PC to this signed-in user.
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { apiService } from './services/api';

type Phase = 'scanning' | 'linking' | 'done' | 'error';

const ACCENT = '#34e3a0';

const PairWorkPCScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [phase, setPhase] = useState<Phase>('scanning');
  const [message, setMessage] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const busy = useRef(false);

  React.useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const parsePairId = (value: string): string | null => {
    const raw = (value || '').trim();
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.t === 'anuvadini-defender-pair' && obj.pairId) return String(obj.pairId);
    } catch {
      // Not JSON — accept a bare 48-char hex pairId as a fallback.
      if (/^[a-f0-9]{32,64}$/i.test(raw)) return raw;
    }
    return null;
  };

  const claim = useCallback(async (pairId: string) => {
    if (busy.current) return;
    busy.current = true;
    setPhase('linking');
    try {
      const res = await apiService.claimDefenderPC(pairId);
      if (res.success) {
        const dev = (res.data as any)?.device;
        setDeviceName(dev?.deviceName || dev?.hostname || 'your work PC');
        setPhase('done');
      } else {
        setMessage(res.error || (res as any).message || 'Could not link this PC.');
        setPhase('error');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Something went wrong. Please try again.');
      setPhase('error');
    }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (busy.current || phase !== 'scanning') return;
      const value = codes?.[0]?.value;
      if (!value) return;
      const pairId = parsePairId(value);
      if (!pairId) {
        setMessage('That is not an Anuvadini work-PC code.');
        setPhase('error');
        return;
      }
      claim(pairId);
    },
  });

  const reset = () => {
    busy.current = false;
    setMessage('');
    setDeviceName('');
    setPhase('scanning');
  };

  // ---- permission / device gates -------------------------------------------
  if (!hasPermission) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + 24 }]}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.gateTitle}>Camera access needed</Text>
        <Text style={styles.gateText}>Allow the camera so you can scan the code on your work PC.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => requestPermission()}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={styles.linkText}>Open settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + 24 }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={ACCENT} />
        <Text style={[styles.gateText, { marginTop: 14 }]}>Starting camera…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase === 'scanning'}
        codeScanner={codeScanner}
      />
      {/* dark scrim + viewfinder */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.iconBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Work PC</Text>
          <View style={styles.iconBtn} />
        </View>

        {phase === 'scanning' && (
          <>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <Text style={styles.hint}>Open Anuvadini Defender on your PC and point your camera at the QR code.</Text>
          </>
        )}

        {phase === 'linking' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.centerTitle}>Linking your PC…</Text>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.center}>
            <View style={styles.tick}><Text style={styles.tickText}>✓</Text></View>
            <Text style={styles.centerTitle}>Work PC linked</Text>
            <Text style={styles.centerSub}>{deviceName} is now linked to your account and protected.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.center}>
            <View style={[styles.tick, styles.tickErr]}><Text style={styles.tickText}>!</Text></View>
            <Text style={styles.centerTitle}>Couldn’t link</Text>
            <Text style={styles.centerSub}>{message}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, backgroundColor: 'rgba(5,10,14,0.45)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  iconBtnText: { color: '#fff', fontSize: 22, marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  frame: { alignSelf: 'center', width: 250, height: 250, marginTop: 70 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: ACCENT },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  hint: { color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 34, paddingHorizontal: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 60 },
  centerTitle: { color: '#fff', fontSize: 21, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  centerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  tick: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(52,227,160,0.16)', alignItems: 'center', justifyContent: 'center' },
  tickErr: { backgroundColor: 'rgba(248,113,113,0.16)' },
  tickText: { color: ACCENT, fontSize: 44, fontWeight: '800' },
  primaryBtn: { marginTop: 26, backgroundColor: ACCENT, paddingVertical: 14, paddingHorizontal: 34, borderRadius: 14 },
  primaryBtnText: { color: '#06120c', fontSize: 15, fontWeight: '800' },
  gate: { flex: 1, backgroundColor: '#0a1016', alignItems: 'center', paddingHorizontal: 32 },
  gateTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 40 },
  gateText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  linkText: { color: ACCENT, fontSize: 14, fontWeight: '600', marginTop: 18 },
  backLink: { marginTop: 8 },
});

export default PairWorkPCScreen;
