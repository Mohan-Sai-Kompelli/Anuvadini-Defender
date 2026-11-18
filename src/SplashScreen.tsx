import * as React from 'react';
import { View, Image, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * App launch / loading splash — the Anuvadini logo on a clean white backdrop.
 * Shown while AuthContext resolves the persisted session (App.tsx isLoading).
 */
export const SplashScreen: React.FC = () => (
  <View style={styles.container}>
    <Image
      source={require('./assets/anuvadini_logo.png')}
      style={styles.logo}
      resizeMode="contain"
    />
    {/* brand teal-green spinner */}
    <ActivityIndicator size="small" color="#2C9E83" style={styles.spinner} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: width * 0.62,
    height: width * 0.62,
  },
  spinner: {
    marginTop: 28,
  },
});
