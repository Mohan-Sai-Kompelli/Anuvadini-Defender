import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { CustomColors as colors } from './colors';
import type { RootTabParamList } from './navigation';

type AuthId = 'face' | 'iris' | 'voice' | 'thumb' | 'palm';

interface AuthMethod {
  id: AuthId;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const authMethods: AuthMethod[] = [
  {
    id: 'face',
    title: 'Face Authentication',
    description: 'Verify your identity using facial recognition',
    icon: '👤',
    color: '#4CAF50',
  },
  // {
  //   id: 'iris',
  //   title: 'Iris Authentication',
  //   description: 'Verify your identity using iris scanning',
  //   icon: '👁️',
  //   color: '#2196F3',
  // },
  // {
  //   id: 'voice',
  //   title: 'Voice Authentication',
  //   description: 'Verify your identity using voice recognition',
  //   icon: '🎤',
  //   color: '#FF9800',
  // },
  // // {
  // //   id: 'thumb',
  // //   title: 'Thumb Print',
  // //   description: 'Verify your identity using thumb print',
  // //   icon: '👍',
  // //   color: '#9C27B0',
  // // },
  // {
  //   id: 'palm',
  //   title: 'Palm Authentication',
  //   description: 'Verify your identity using palm recognition',
  //   icon: '🖐️',
  //   color: '#F44336',
  // },
];

export const AuthSelectionScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();

  const handleAuthMethodSelect = (methodId: AuthId) => {
    // Always go to Attendance screen with the selected method.
    navigation.navigate('Attendance', { method: methodId });
  };

  const renderAuthCard = (method: AuthMethod) => (
    <TouchableOpacity
      key={method.id}
      style={[styles.authCard, { borderLeftColor: method.color }]}
      onPress={() => handleAuthMethodSelect(method.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: method.color + '20' }]}>
        <Text style={styles.icon}>{method.icon}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{method.title}</Text>
        <Text style={styles.cardDescription}>{method.description}</Text>
      </View>
      <View style={[styles.arrowContainer, { backgroundColor: method.color }]}>
        <Text style={styles.arrow}>→</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Select Authentication Method</Text>
          <Text style={styles.subtitle}>
            Choose your preferred method to verify your identity
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.dashboardBtn}
              onPress={() => navigation.navigate('UserDashboard')}
              activeOpacity={0.8}
            >
              <Text style={styles.dashboardBtnText}>🧭 Open Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Authentication Cards */}
        <View style={styles.cardsContainer}>
          {authMethods.map(renderAuthCard)}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            All authentication methods are secure and encrypted
          </Text>
          <Text style={styles.footerSubtext}>
            🔒 Your biometric data is protected
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  actionsRow: {
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  dashboardBtn: {
    backgroundColor: '#0259ca',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dashboardBtnText: {
    color: 'white',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  cardsContainer: {
    marginBottom: 30,
  },
  authCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    alignItems: 'center',
    ...cardShadow,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  icon: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  arrowContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
