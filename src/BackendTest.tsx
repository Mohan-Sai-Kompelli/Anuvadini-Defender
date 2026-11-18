import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { apiService } from './services/api';

export const BackendTest: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  const testBackend = async () => {
    setIsTesting(true);
    setTestResult('Testing...');
    
    try {
      console.log('Testing backend connectivity...');
      
      // Test basic connectivity
      const response = await fetch('http://192.168.110.95:5000/api/auth/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Backend response status:', response.status);
      
      if (response.status === 401) {
        setTestResult('✅ Backend is reachable (401 is expected without auth)');
        Alert.alert('Backend Test', 'Backend is reachable! 401 error is expected without authentication.');
      } else if (response.ok) {
        setTestResult('✅ Backend is reachable and responding');
        Alert.alert('Backend Test', 'Backend is reachable and responding!');
      } else {
        setTestResult(`❌ Backend responded with status: ${response.status}`);
        Alert.alert('Backend Test', `Backend responded with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Backend test error:', error);
      setTestResult('❌ Backend is not reachable');
      Alert.alert('Backend Test', 'Backend is not reachable. Please check if the server is running at http://192.168.110.219:5000');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Backend Connectivity Test</Text>
      <Text style={styles.subtitle}>Test if the backend server is reachable</Text>
      
      <TouchableOpacity
        style={styles.testButton}
        onPress={testBackend}
        disabled={isTesting}
      >
        <Text style={styles.testButtonText}>
          {isTesting ? 'Testing...' : 'Test Backend'}
        </Text>
      </TouchableOpacity>
      
      {testResult ? (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>{testResult}</Text>
        </View>
      ) : null}
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Expected Backend URL: http://192.168.110.219:5000
        </Text>
        <Text style={styles.infoText}>
          Make sure the Node.js backend is running before testing.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    minWidth: 300,
  },
  resultText: {
    fontSize: 14,
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    minWidth: 300,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 5,
  },
}); 