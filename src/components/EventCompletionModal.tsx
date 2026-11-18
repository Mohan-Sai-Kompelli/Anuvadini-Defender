import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { Camera, Check, Clock, MapPin, ScanFace, X } from 'lucide-react-native';
import { LivenessChallenge } from './LivenessChallenge';
import { apiService } from '../services/api';
import { requestLocationPermission, getCurrentPositionDetailed } from '../utils/location';
import { geotagImage } from '../utils/geotag';
import { nowHHMM, type SchedEvent } from '../utils/scheduleEvents';

type Geo = { latitude: number; longitude: number; accuracy: number };

/**
 * Completion flow for a calendar event (class):
 *   1. Verify identity with the app's own face verification (LivenessChallenge).
 *   2. Click a geotagged photo with students (location + time burned
 *      into the image).
 *   3. Submit to the verified ClassCheckin backend endpoint, which the
 *      dashboards read.
 */
export const EventCompletionModal: React.FC<{
  event: SchedEvent;
  dateISO: string;
  onClose: () => void;
  onDone: () => void;
}> = ({ event, dateISO, onClose, onDone }) => {
  const countLabel = 'Students present';

  const [geo, setGeo] = useState<Geo | null>(null);
  const [locating, setLocating] = useState(true);
  const [showLiveness, setShowLiveness] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [count, setCount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ time: string; location: string; geo: Geo | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const granted = await requestLocationPermission();
        if (granted) setGeo(await getCurrentPositionDetailed());
      } catch {
        // proceed without geo
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  const onFaceVerified = (img?: any) => {
    setShowLiveness(false);
    setFaceVerified(true);
    if (typeof img === 'string' && img.startsWith('data:')) setFaceImage(img);
  };

  const capturePhoto = async () => {
    try {
      const img: any = await ImagePicker.openCamera({
        mediaType: 'photo',
        cropping: false,
        includeBase64: true,
        compressImageQuality: 0.6,
        // NOTE: width/height only apply when cropping:true. To actually shrink a
        // full-res capture (so the base64 fits in the JSON upload) use the
        // compressImageMax* options, which resize without cropping.
        compressImageMaxWidth: 1280,
        compressImageMaxHeight: 1280,
      });
      if (img?.data) {
        const raw = `data:${img.mime || 'image/jpeg'};base64,${img.data}`;
        // Burn the location + time into the photo (geotag).
        const stamped = geotagImage(raw, {
          latitude: geo?.latitude,
          longitude: geo?.longitude,
          accuracy: geo?.accuracy,
          place: event.location || 'Class',
          when: `${dateISO} ${nowHHMM()}`,
        });
        setPhoto(stamped);
      }
    } catch {
      // cancelled
    }
  };

  const submit = async () => {
    if (!faceVerified) return Alert.alert('Verify your face', 'Complete the face verification first.');
    if (!photo) return Alert.alert('Photo required', 'Click a geotagged photo with students.');
    setSubmitting(true);
    try {
      const time = nowHHMM();
      const photos: Array<{ label: string; image: string }> = [];
      if (faceImage) photos.push({ label: 'Face verification', image: faceImage });
      photos.push({
        label: 'Class with students (geotagged)',
        image: photo,
      });

      const start = await apiService.classCheckin({
        timetableId: event.id,
        action: 'start',
        date: dateISO,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        accuracy: geo?.accuracy,
        place: event.location,
        headcount: parseInt(count, 10) || undefined,
        note: notes || undefined,
        photos,
      });
      if (!start.success) throw new Error(start.error || 'Could not start the class');
      await apiService.classCheckin({ timetableId: event.id, action: 'end', date: dateISO });
      setResult({ time, location: event.location, geo });
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not submit the event evidence.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Our face verification (liveness + recognition), not a plain camera. */}
      <LivenessChallenge
        visible={showLiveness}
        attendanceType="class"
        currentLocation={geo}
        onVerified={onFaceVerified}
        onCancel={() => setShowLiveness(false)}
      />

      <Modal visible={!showLiveness} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{result ? 'Evidence submitted' : 'Complete event'}</Text>
              <TouchableOpacity onPress={result ? onDone : onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.evTitle}>{event.title}</Text>
            <Text style={styles.evMeta}>
              {event.subtype}
              {event.start ? ` · ${event.start}` : ''}
              {event.end ? `–${event.end}` : ''}
              {event.location ? ` · ${event.location}` : ''}
            </Text>

            {result ? (
              <View style={styles.doneBox}>
                <View style={styles.doneCheck}>
                  <Check size={28} color="#16A34A" />
                </View>
                <Text style={styles.doneText}>Class conducted</Text>
                <Text style={styles.doneMeta}>
                  <Clock size={12} color="#64748B" /> {result.time}
                  {result.location ? `   ·   ${result.location}` : ''}
                </Text>
                {result.geo ? (
                  <Text style={styles.doneMeta}>
                    <MapPin size={12} color="#64748B" /> {result.geo.latitude.toFixed(5)}, {result.geo.longitude.toFixed(5)} (±{Math.round(result.geo.accuracy)}m)
                  </Text>
                ) : null}
                <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 16 }]} onPress={onDone}>
                  <Text style={styles.btnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.geoLine}>
                  <MapPin size={12} color={geo ? '#16A34A' : '#94A3B8'} />{' '}
                  {locating ? 'Getting your location…' : geo ? `Location captured (±${Math.round(geo.accuracy)}m)` : 'Location unavailable'}
                </Text>

                {/* Step 1: face verification */}
                <TouchableOpacity style={[styles.btn, faceVerified ? styles.btnOk : styles.btnGhost]} onPress={() => setShowLiveness(true)}>
                  {faceVerified ? <Check size={16} color="#16A34A" /> : <ScanFace size={16} color="#2C9E83" />}
                  <Text style={faceVerified ? styles.btnOkText : styles.btnGhostText}>
                    {faceVerified ? 'Face verified ✓' : 'Verify your face'}
                  </Text>
                </TouchableOpacity>

                {/* Step 2: geotagged photo */}
                <TouchableOpacity style={[styles.btn, photo ? styles.btnOk : styles.btnGhost, { marginTop: 8 }]} onPress={capturePhoto}>
                  {photo ? <Check size={16} color="#16A34A" /> : <Camera size={16} color="#2C9E83" />}
                  <Text style={photo ? styles.btnOkText : styles.btnGhostText}>
                    {photo ? `Geotagged photo ✓` : 'Click geotagged photo with students'}
                  </Text>
                </TouchableOpacity>
                {photo ? <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" /> : null}

                <Text style={styles.label}>{countLabel}</Text>
                <TextInput style={styles.input} value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="0" placeholderTextColor="#94A3B8" />

                <Text style={styles.label}>Notes (optional)</Text>
                <TextInput style={[styles.input, { height: 60 }]} value={notes} onChangeText={setNotes} multiline placeholder="Topic covered / remarks" placeholderTextColor="#94A3B8" />

                <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 16 }]} disabled={submitting} onPress={submit}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submit & verify</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

export default EventCompletionModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  evTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  evMeta: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 8 },
  geoLine: { fontSize: 12, color: '#475569', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A' },
  thumb: { width: '100%', height: 150, borderRadius: 12, marginTop: 10, backgroundColor: '#E2E8F0' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  btnPrimary: { backgroundColor: '#2C9E83' },
  btnGhost: { borderWidth: 1, borderColor: '#2C9E83', backgroundColor: 'rgba(44,158,131,0.06)' },
  btnGhostText: { color: '#E8590C', fontWeight: '700', fontSize: 14 },
  btnOk: { borderWidth: 1, borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,0.08)' },
  btnOkText: { color: '#16A34A', fontWeight: '700', fontSize: 14 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  doneBox: { alignItems: 'center', paddingVertical: 12 },
  doneCheck: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(22,163,74,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  doneText: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  doneMeta: { fontSize: 13, color: '#64748B', marginTop: 2 },
});
