import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiService } from './services/api';

export const APIConnectionTest: React.FC = () => {
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  const runTests = async () => {
    setIsLoading(true);
    const results: Record<string, any> = {};

    try {
      // Test 1: Health Check
      console.log('[TEST] Running health check...');
      results.healthCheck = {
        status: 'testing',
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      const healthResponse = await apiService.healthCheck();
      results.healthCheck = {
        status: healthResponse.success ? 'PASS ✅' : 'FAIL ❌',
        response: healthResponse,
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      // Test 2: Student Lookup with valid UID
      console.log('[TEST] Running student lookup...');
      results.studentLookup = {
        status: 'testing',
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      const lookupResponse = await apiService.lookupStudentByUID('8117882067');
      results.studentLookup = {
        status: lookupResponse.success ? 'PASS ✅' : 'FAIL ❌',
        response: lookupResponse,
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      // Test 3: Student Lookup with invalid UID
      console.log('[TEST] Running invalid UID lookup...');
      results.invalidLookup = {
        status: 'testing',
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      const invalidResponse = await apiService.lookupStudentByUID('INVALID123');
      results.invalidLookup = {
        status: invalidResponse.success ? 'FAIL (should have failed)' : 'PASS ✅ (correctly failed)',
        response: invalidResponse,
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });

      Alert.alert('Tests Complete', 'Check the results below');
    } catch (error) {
      console.error('[TEST] Error:', error);
      results.error = {
        status: 'ERROR ❌',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
      setTestResults({ ...results });
      Alert.alert('Test Error', error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔧 API Connection Test</Text>
        <Text style={styles.subtitle}>Test backend connectivity</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={runTests}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Run All Tests</Text>
        )}
      </TouchableOpacity>

      <View style={styles.resultsContainer}>
        {Object.entries(testResults).map(([testName, result]) => (
          <View key={testName} style={styles.testResult}>
            <View style={styles.testHeader}>
              <Text style={styles.testName}>{testName}</Text>
              <Text
                style={[
                  styles.testStatus,
                  result.status?.includes('PASS') && styles.statusPass,
                  result.status?.includes('FAIL') && styles.statusFail,
                  result.status?.includes('ERROR') && styles.statusError,
                  result.status?.includes('testing') && styles.statusTesting,
                ]}
              >
                {result.status}
              </Text>
            </View>

            {result.response && (
              <View style={styles.responseBox}>
                <Text style={styles.responseLabel}>Response:</Text>
                <Text style={styles.responseText}>
                  {JSON.stringify(result.response, null, 2)}
                </Text>
              </View>
            )}

            {result.message && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{result.message}</Text>
              </View>
            )}

            {result.timestamp && (
              <Text style={styles.timestamp}>{result.timestamp}</Text>
            )}
          </View>
        ))}
      </View>

      {Object.keys(testResults).length === 0 && !isLoading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Click "Run All Tests" to test backend connectivity
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    marginBottom: 40,
  },
  testResult: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  testName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  testStatus: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusPass: {
    backgroundColor: '#d4edda',
    color: '#155724',
    borderLeftColor: '#28a745',
  },
  statusFail: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderLeftColor: '#dc3545',
  },
  statusError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderLeftColor: '#dc3545',
  },
  statusTesting: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    borderLeftColor: '#ffc107',
  },
  responseBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  responseText: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'Courier New',
  },
  errorBox: {
    backgroundColor: '#f8d7da',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#721c24',
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
