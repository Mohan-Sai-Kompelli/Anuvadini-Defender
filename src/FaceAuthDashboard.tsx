import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { apiService } from './services/api';
import { CustomColors as colors } from './colors';

const { width } = Dimensions.get('window');

interface FaceAuthRecord {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  };
  success: boolean;
  confidence: number;
  message: string;
  attendanceType?: 'in' | 'out' | null;
  timestamp: string;
  imageData: string;
  ipAddress?: string;
  userAgent?: string;
}

interface FaceAuthStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
  averageConfidence: number;
  maxConfidence: number;
  minConfidence: number;
}

export const FaceAuthDashboard: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<FaceAuthRecord[]>([]);
  const [stats, setStats] = useState<FaceAuthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadFaceAuthData = async (page = 1, refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
        setCurrentPage(1);
      }

      // Load face authentication history
      const historyResponse = await apiService.getFaceAuthHistory({
        userId: user?.role === 'student' ? user.id : undefined,
        limit: 20,
        page: page
      });

      if (historyResponse.success && historyResponse.data) {
        const newRecords = historyResponse.data.records;
        if (page === 1) {
          setRecords(newRecords);
        } else {
          setRecords(prev => [...prev, ...newRecords]);
        }
        setHasMore(newRecords.length === 20);
      }

      // Load statistics
      const statsResponse = await apiService.getFaceAuthStats({
        userId: user?.role === 'student' ? user.id : undefined
      });

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
    } catch (error) {
      console.error('Error loading face auth data:', error);
      Alert.alert('Error', 'Failed to load face authentication data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadFaceAuthData(nextPage);
    }
  };

  const onRefresh = () => {
    loadFaceAuthData(1, true);
  };

  useEffect(() => {
    loadFaceAuthData();
  }, []);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (success: boolean) => {
    return success ? colors.success : colors.error;
  };

  const getStatusIcon = (success: boolean) => {
    return success ? '✅' : '❌';
  };

  const getAttendanceTypeIcon = (type?: 'in' | 'out' | null) => {
    switch (type) {
      case 'in':
        return '📥';
      case 'out':
        return '📤';
      default:
        return '🔐';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading face authentication data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
          if (isCloseToBottom && hasMore) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Face Authentication Dashboard</Text>
          <Text style={styles.subtitle}>
            {user?.role === 'student' ? 'Your authentication history' : 'Organization authentication records'}
          </Text>
        </View>

        {/* Statistics Card */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>📊 Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.totalAttempts}</Text>
                <Text style={styles.statLabel}>Total Attempts</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {stats.successfulAttempts}
                </Text>
                <Text style={styles.statLabel}>Successful</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.error }]}>
                  {stats.failedAttempts}
                </Text>
                <Text style={styles.statLabel}>Failed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {stats.successRate.toFixed(1)}%
                </Text>
                <Text style={styles.statLabel}>Success Rate</Text>
              </View>
            </View>
            <View style={styles.confidenceStats}>
              <Text style={styles.confidenceLabel}>Confidence Range:</Text>
              <Text style={styles.confidenceValue}>
                {stats.minConfidence.toFixed(2)} - {stats.maxConfidence.toFixed(2)}
              </Text>
              <Text style={styles.confidenceLabel}>Average:</Text>
              <Text style={styles.confidenceValue}>
                {stats.averageConfidence.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Records List */}
        <View style={styles.recordsContainer}>
          <Text style={styles.recordsTitle}>🔍 Recent Authentication Records</Text>
          
          {records.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyText}>No authentication records found</Text>
            </View>
          ) : (
            records.map((record) => (
              <View key={record._id} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <View style={styles.recordStatus}>
                    <Text style={styles.statusIcon}>
                      {getStatusIcon(record.success)}
                    </Text>
                    <Text style={[
                      styles.statusText,
                      { color: getStatusColor(record.success) }
                    ]}>
                      {record.success ? 'Success' : 'Failed'}
                    </Text>
                  </View>
                  <View style={styles.recordType}>
                    <Text style={styles.typeIcon}>
                      {getAttendanceTypeIcon(record.attendanceType)}
                    </Text>
                    <Text style={styles.typeText}>
                      {record.attendanceType ? record.attendanceType.toUpperCase() : 'General'}
                    </Text>
                  </View>
                </View>

                <View style={styles.recordDetails}>
                  {user?.role === 'organization' && (
                    <Text style={styles.userInfo}>
                      👤 {record.userId.name} ({record.userId.email})
                    </Text>
                  )}
                  
                  <Text style={styles.confidenceInfo}>
                    🎯 Confidence: {(record.confidence * 100).toFixed(1)}%
                  </Text>
                  
                  <Text style={styles.messageInfo}>
                    💬 {record.message}
                  </Text>
                  
                  <Text style={styles.timestampInfo}>
                    🕒 {formatDate(record.timestamp)}
                  </Text>
                  
                  <Text style={styles.imageInfo}>
                    📸 Image: {record.imageData}
                  </Text>
                </View>
              </View>
            ))
          )}

          {hasMore && (
            <View style={styles.loadMoreContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadMoreText}>Loading more records...</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    padding: 20,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  statsCard: {
    margin: 20,
    padding: 20,
    backgroundColor: colors.white,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    width: (width - 80) / 2,
    alignItems: 'center',
    marginBottom: 16,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  confidenceStats: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  confidenceLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  confidenceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  recordsContainer: {
    padding: 20,
  },
  recordsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recordCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recordStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  recordType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  typeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  recordDetails: {
    gap: 8,
  },
  userInfo: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  confidenceInfo: {
    fontSize: 14,
    color: colors.text,
  },
  messageInfo: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  timestampInfo: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  imageInfo: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
}); 