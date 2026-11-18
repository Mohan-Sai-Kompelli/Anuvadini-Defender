import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  History,
  Repeat,
  TrendingUp,
} from 'lucide-react-native';
import { apiService } from './services/api';
import {
  Card,
  EmptyState,
  ProgressRing,
  Screen,
  SectionHeader,
  SkeletonCard,
  StatusBadge,
  useTheme,
} from './components/ui';

interface LeaveBalance {
  combinedLeaveBalance: number;
  totalLeavesEarned: number;
  totalLeavesUsed: number;
  transactions?: Transaction[];
  monthlyData?: MonthlyData[];
}

interface Transaction {
  _id: string;
  date: string;
  type: 'earned' | 'used' | 'adjusted';
  quantity: number;
  reason: string;
}

interface MonthlyData {
  month: string;
  earned: number;
  used: number;
}

interface LeaveRequest {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  leaveDates: {
    start: string;
    end: string;
  };
  reason: string;
}

export const LeaveBalanceScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing, radii, typography } = theme;

  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [balanceRes, leavesRes] = await Promise.all([
        apiService.getLeaveBalance?.() || Promise.resolve({ success: false }),
        apiService.getLeaveRequests?.() || Promise.resolve({ success: false }),
      ]);

      if (balanceRes.success && balanceRes.data) {
        setLeaveBalance(balanceRes.data);
      }

      if (leavesRes.success && leavesRes.data) {
        console.log('[LeaveBalance] leavesRes.data length:', Array.isArray(leavesRes.data) ? leavesRes.data.length : 'not an array', 'keys:', Object.keys(leavesRes.data));
        const leaves = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        const approvedOnly = leaves.filter((l) => l.status === 'approved');
        console.log('[LeaveBalance] Setting approved leaves:', approvedOnly.length, JSON.stringify(approvedOnly));
        setLeaveRequests(approvedOnly);
      } else {
        console.log('[LeaveBalance] leavesRes failed or data falsy:', leavesRes.success, leavesRes.error);
      }
    } catch (error) {
      console.error('Failed to load leave balance data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Calculate gauge percentage
  const gaugePercentage = useMemo(() => {
    if (!leaveBalance) return 0;
    const total = leaveBalance.totalLeavesEarned || 24; // 24 total yearly leaves quota (2 leaves/month)
    return (leaveBalance.combinedLeaveBalance / total) * 100;
  }, [leaveBalance]);

  // Used ratio for the "used" ring (real numbers only).
  const usedRatio = useMemo(() => {
    if (!leaveBalance) return 0;
    const total = leaveBalance.totalLeavesEarned || 24;
    return (leaveBalance.totalLeavesUsed ?? 0) / total;
  }, [leaveBalance]);

  // Calculate total used days from leave requests
  const totalUsedDays = useMemo(() => {
    return leaveRequests.reduce((sum, leave) => {
      const start = new Date(leave.leaveDates.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(leave.leaveDates.end || leave.leaveDates.start);
      end.setHours(0, 0, 0, 0);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return sum + days;
    }, 0);
  }, [leaveRequests]);

  const transactionMeta = (type: Transaction['type']) => {
    switch (type) {
      case 'earned':
        return { icon: CirclePlus, color: colors.success };
      case 'used':
        return { icon: CircleMinus, color: colors.danger };
      default:
        return { icon: Repeat, color: colors.brand };
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ gap: spacing.lg }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh} edges={['left', 'right']}>
      {/* Header */}
      <Animated.View
        entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
      >
        <Text style={[typography.h2, { color: colors.text }]}>Leave Balance</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Track your annual leave
        </Text>
      </Animated.View>

      {/* Balance ring card */}
      {leaveBalance && (
        <Card elevation={2} enteringIndex={0} style={{ marginTop: spacing.lg }}>
          <View style={styles.ringContainer}>
            <ProgressRing
              progress={gaugePercentage / 100}
              size={172}
              strokeWidth={14}
              color={colors.brand}
            >
              <Text style={[typography.h1, { color: colors.brand }]}>
                {leaveBalance.combinedLeaveBalance}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Days Available
              </Text>
            </ProgressRing>
          </View>

          <View
            style={[
              styles.ringInfo,
              { borderTopColor: colors.border, marginTop: spacing.lg, paddingTop: spacing.md },
            ]}
          >
            <View style={styles.ringInfoRow}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Total Earned
              </Text>
              <Text style={[typography.title, { color: colors.brand }]}>
                {leaveBalance.totalLeavesEarned ?? '—'}
              </Text>
            </View>
            <View style={styles.ringInfoRow}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                Total Used
              </Text>
              <Text style={[typography.title, { color: colors.brand }]}>
                {leaveBalance.totalLeavesUsed ?? '—'}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Per-type balance cards (used/total rings, real numbers only) */}
      {leaveBalance && (
        <View style={[styles.miniRow, { marginTop: spacing.lg }]}>
          <Card elevation={1} enteringIndex={1} style={styles.miniCard}>
            <View style={styles.miniContent}>
              <ProgressRing
                progress={gaugePercentage / 100}
                size={64}
                strokeWidth={7}
                color={colors.success}
              >
                <Text style={[typography.title, { color: colors.text }]}>
                  {leaveBalance.combinedLeaveBalance}
                </Text>
              </ProgressRing>
              <View style={styles.miniText}>
                <View style={styles.miniTitleRow}>
                  <CalendarCheck size={14} color={colors.success} />
                  <Text style={[typography.bodyBold, { color: colors.text }]}>
                    Available
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  of {leaveBalance.totalLeavesEarned ?? '—'} earned
                </Text>
              </View>
            </View>
          </Card>

          <Card elevation={1} enteringIndex={2} style={styles.miniCard}>
            <View style={styles.miniContent}>
              <ProgressRing
                progress={usedRatio}
                size={64}
                strokeWidth={7}
                color={colors.warning}
              >
                <Text style={[typography.title, { color: colors.text }]}>
                  {totalUsedDays}
                </Text>
              </ProgressRing>
              <View style={styles.miniText}>
                <View style={styles.miniTitleRow}>
                  <History size={14} color={colors.warning} />
                  <Text style={[typography.bodyBold, { color: colors.text }]}>
                    Used
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  Approved days
                </Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      {/* Monthly Accrual */}
      {leaveBalance?.monthlyData && leaveBalance.monthlyData.length > 0 && (
        <>
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Monthly Accrual" icon={TrendingUp} />
          </View>
          <Card elevation={1} enteringIndex={3}>
            {leaveBalance.monthlyData.slice(-3).map((month, index) => (
              <View
                key={index}
                style={[
                  styles.monthlyRow,
                  { borderBottomColor: colors.border, paddingBottom: spacing.md },
                  index > 0 && { marginTop: spacing.md },
                ]}
              >
                <Text style={[typography.body, styles.monthlyMonth, { color: colors.text }]}>
                  {month.month}
                </Text>
                <View
                  style={[
                    styles.monthlyBars,
                    { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm },
                  ]}
                >
                  <View
                    style={[
                      styles.monthlyBar,
                      { backgroundColor: colors.success, width: `${(month.earned / 2) * 100}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.monthlyBar,
                      { backgroundColor: colors.danger, width: `${(month.used / 2) * 100}%` },
                    ]}
                  />
                </View>
                <View style={styles.monthlyValues}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {month.earned}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {month.used}
                  </Text>
                </View>
              </View>
            ))}
            <View style={[styles.monthlyLegend, { paddingTop: spacing.md }]}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  Earned
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  Used
                </Text>
              </View>
            </View>
          </Card>
        </>
      )}

      {/* Transaction History */}
      {leaveBalance?.transactions && leaveBalance.transactions.length > 0 && (
        <>
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Transaction History" icon={History} />
          </View>
          {leaveBalance.transactions.slice(0, 10).map((transaction, index) => {
            const meta = transactionMeta(transaction.type);
            const TxIcon = meta.icon;
            return (
              <Card
                key={transaction._id}
                elevation={1}
                enteringIndex={Math.min(index, 8)}
                padding={spacing.md}
                style={{ marginBottom: spacing.sm }}
                accessibilityLabel={`${transaction.type} ${transaction.quantity} days, ${transaction.reason}`}
              >
                <View style={styles.transactionRow}>
                  <TxIcon size={22} color={meta.color} />
                  <View style={styles.transactionContent}>
                    <Text style={[typography.body, { color: colors.text }]}>
                      {transaction.reason}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {new Date(transaction.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={[typography.title, { color: meta.color }]}>
                    {transaction.type === 'earned' ? '+' : '-'}{transaction.quantity}
                  </Text>
                </View>
              </Card>
            );
          })}
        </>
      )}

      {/* Approved Leave Requests */}
      {leaveRequests.length > 0 && (
        <>
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Approved Leaves" icon={CircleCheck} />
          </View>
          {leaveRequests.slice(0, 5).map((leave, index) => {
            const startDate = new Date(leave.leaveDates.start);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(leave.leaveDates.end || leave.leaveDates.start);
            endDate.setHours(0, 0, 0, 0);
            const diff = Math.abs(endDate.getTime() - startDate.getTime());
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;

            return (
              <Card
                key={leave._id}
                elevation={1}
                enteringIndex={Math.min(index, 8)}
                padding={spacing.md}
                style={{ marginBottom: spacing.sm }}
              >
                <View style={styles.leaveHeader}>
                  <Text style={[typography.bodyBold, { color: colors.text }]}>
                    {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                    {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <StatusBadge status="approved" label={`${days} day${days > 1 ? 's' : ''}`} size="small" />
                </View>
                {leave.reason ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.textMuted, marginTop: spacing.xs },
                    ]}
                  >
                    {leave.reason}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      )}

      {leaveRequests.length === 0 && (
        <EmptyState
          icon={CalendarX}
          title="No approved leaves"
          message="Your approved leave requests will appear here."
          style={{ marginTop: spacing.lg }}
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  ringContainer: {
    alignItems: 'center',
  },
  ringInfo: {
    borderTopWidth: 1,
  },
  ringInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 12,
  },
  miniCard: {
    flex: 1,
  },
  miniContent: {
    alignItems: 'center',
    gap: 8,
  },
  miniText: {
    alignItems: 'center',
    gap: 2,
  },
  miniTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  monthlyMonth: {
    width: 80,
  },
  monthlyBars: {
    flex: 1,
    height: 20,
    flexDirection: 'row',
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  monthlyBar: {
    height: '100%',
  },
  monthlyValues: {
    width: 48,
    alignItems: 'flex-end',
  },
  monthlyLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionContent: {
    flex: 1,
  },
  leaveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
});

export default LeaveBalanceScreen;
