import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

export const Header: React.FC = () => (
  <View style={styles.header}>
      <Image
        source={require('../assets/logo-home.png')}
        style={styles.logoOne}
        resizeMode="contain"
      />
      <Image
        source={require('../assets/anuvadini_logo.png')}
        style={styles.logoTwo}
        resizeMode="contain"
      />
    </View>
);

const styles = StyleSheet.create({
  header: {
    // backgroundColor: '#0259ca',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 5,
  },
  logoOne: {
    width: 270,
    height: 60,
  },
  logoTwo: {
    width: 100,
    height: 40,
  },
});