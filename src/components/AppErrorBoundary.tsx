import * as React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RefreshCw, TriangleAlert } from 'lucide-react-native';

/**
 * Root-level safety net. React Native has NO built-in fallback for an
 * uncaught render error outside dev mode — the whole tree unmounts and the
 * user is left staring at a blank WHITE screen with no message and no way
 * back in, which is what a chunk of the ~200 live users hit (some data shape
 * or device quirk threw during render somewhere in the tree, and nothing
 * upstream of this was ever catching it). This is the single catch-all at
 * the very root of App.tsx, above navigation/auth, so no matter where the
 * throw happens, the user sees a real screen with a way to recover instead
 * of a dead white one.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] uncaught render error:', error, info?.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.fill}>
          <View style={styles.center}>
            <View style={styles.iconWrap}>
              <TriangleAlert size={28} color="#DC2626" />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.body}>
              The app hit an unexpected error. Tap below to try again — if it
              keeps happening, please let us know what you were doing.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={this.reset}>
              <RefreshCw size={15} color="#fff" />
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(220,38,38,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2C9E83',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});
