import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Theme } from './theme';
import { apiService } from './services/api';
import { SectionHeader } from './components/ui/SectionHeader';
import { StatusBadge } from './components/ui/StatusBadge';
import { useTabBarScrollHandler } from './components/ui/tabBarScroll';

interface Holiday {
  _id: string;
  name: string;
  date: string;
  type: 'national' | 'state' | 'optional' | 'restricted';
}

interface LeaveRequest {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  leaveDates: {
    start: string;
    end: string;
  };
}

interface CalendarDate {
  date: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isHoliday: boolean;
  isWeekend: boolean;
  isLeaveApproved: boolean;
  isLeavePending: boolean;
  holiday?: Holiday;
}

export const HolidayCalendarScreen: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [remainingLeaves, setRemainingLeaves] = useState(24);
  const onScroll = useTabBarScrollHandler();

  const loadData = async (forceRefresh = false) => {
    try {
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const [holidaysRes, leavesRes] = await Promise.all([
        apiService.getHolidays?.(month, year, forceRefresh) || Promise.resolve({ success: false }),
        apiService.getLeaveRequests?.({ forceRefresh }) || Promise.resolve({ success: false }),
      ]);

      if (holidaysRes.success && holidaysRes.data) {
        setHolidays(Array.isArray(holidaysRes.data) ? holidaysRes.data : []);
      }

      if (leavesRes.success && leavesRes.data) {
        const leaves = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        setLeaveRequests(leaves);
      }

      // Try to get remaining leaves (default 24)
      if (apiService.getRemainingLeaves) {
        const balanceRes = await apiService.getRemainingLeaves?.();
        if (balanceRes?.success && balanceRes.data?.remaining != null) {
          setRemainingLeaves(balanceRes.data.remaining);
        } else {
          setRemainingLeaves(24);
        }
      }
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  // Generate calendar grid
  const calendarDates = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const dates: CalendarDate[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const isCurrentMonth = date.getMonth() === month;
      const isToday = date.toDateString() === today.toDateString();
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

      // Check if it's a holiday
      const holiday = holidays.find((h) => {
        const hDate = new Date(h.date);
        return hDate.toDateString() === date.toDateString();
      });

      // Check if there's a leave on this date
      const leave = leaveRequests.find((l) => {
        const start = new Date(l.leaveDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(l.leaveDates.end || l.leaveDates.start);
        end.setHours(23, 59, 59, 999);
        const curr = new Date(date);
        curr.setHours(12, 0, 0, 0);
        return curr >= start && curr <= end;
      });

      dates.push({
        date: date.getDate(),
        isCurrentMonth,
        isToday,
        isHoliday: !!holiday,
        isWeekend,
        isLeaveApproved: leave?.status === 'approved',
        isLeavePending: leave?.status === 'pending',
        holiday,
      });
    }

    return dates;
  }, [currentDate, holidays, leaveRequests]);

  const getDateColor = (dateItem: CalendarDate) => {
    if (dateItem.isHoliday) return Theme.colors.error;
    if (dateItem.isLeaveApproved) return Theme.colors.success;
    if (dateItem.isLeavePending) return Theme.colors.warning;
    if (dateItem.isToday) return Theme.colors.primary;
    if (dateItem.isWeekend) return '#94A3B8';
    return Theme.colors.textSecondary;
  };

  const getDateBgColor = (dateItem: CalendarDate) => {
    if (dateItem.isToday) return Theme.colors.primaryLight;
    if (dateItem.isHoliday) return 'rgba(244, 67, 54, 0.1)';
    if (dateItem.isLeaveApproved) return 'rgba(76, 175, 80, 0.1)';
    if (dateItem.isLeavePending) return 'rgba(255, 152, 0, 0.1)';
    if (dateItem.isWeekend) return 'rgba(148, 163, 184, 0.08)';
    return 'transparent';
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
          <Text style={styles.loadingText}>Loading calendar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.ScrollView
        style={styles.scrollView}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Holiday Calendar</Text>
          <Text style={styles.subtitle}>
            You have <Text style={styles.boldText}>{remainingLeaves}</Text> days left
          </Text>
        </View>

        {/* Month Navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            style={styles.navButton}
          >
            <Text style={styles.navButtonText}>‹ Prev</Text>
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>

          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            style={styles.navButton}
          >
            <Text style={styles.navButtonText}>Next ›</Text>
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Theme.colors.error }]} />
            <Text style={styles.legendText}>Holiday</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#94A3B8' }]} />
            <Text style={styles.legendText}>Weekend</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Theme.colors.success }]} />
            <Text style={styles.legendText}>Approved</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Theme.colors.warning }]} />
            <Text style={styles.legendText}>Pending</Text>
          </View>
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarContainer}>
          {/* Week day headers */}
          <View style={styles.weekdayRow}>
            {weekDays.map((day, idx) => (
              <Text key={day} style={[styles.weekdayText, (idx === 0 || idx === 6) && { color: '#64748B', fontWeight: '700' }]}>
                {day}
              </Text>
            ))}
          </View>

          {/* Calendar dates */}
          <View style={styles.datesGrid}>
            {calendarDates.map((dateItem, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  setSelectedDate(dateItem);
                  setShowDetailModal(true);
                }}
                disabled={!dateItem.isCurrentMonth && !dateItem.isHoliday && !dateItem.isLeaveApproved}
                style={[
                  styles.dateCell,
                  {
                    backgroundColor: getDateBgColor(dateItem),
                    opacity: dateItem.isCurrentMonth ? 1 : 0.4,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dateText,
                    {
                      color: getDateColor(dateItem),
                      fontWeight: dateItem.isToday || dateItem.isWeekend ? 'bold' : 'normal',
                    },
                  ]}
                >
                  {dateItem.date}
                </Text>
                {dateItem.isHoliday && <Text style={styles.dateIcon}>🎉</Text>}
                {dateItem.isLeaveApproved && <Text style={styles.dateIcon}>✓</Text>}
                {dateItem.isLeavePending && <Text style={styles.dateIcon}>⏳</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming Holidays Section */}
        <SectionHeader title="Upcoming Holidays" icon="🗓️" />
        {holidays.length > 0 ? (
          <View style={styles.holidaysList}>
            {holidays.slice(0, 5).map((holiday) => (
              <View key={holiday._id} style={styles.holidayItem}>
                <View style={styles.holidayLeft}>
                  <Text style={styles.holidayDate}>
                    {new Date(holiday.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <View style={styles.holidayContent}>
                  <Text style={styles.holidayName}>{holiday.name}</Text>
                  <StatusBadge status="holiday" label={holiday.type} size="small" />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No holidays this month</Text>
          </View>
        )}

        <View style={{ height: Theme.spacing.lg }} />
      </Animated.ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedDate && (
              <>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowDetailModal(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>

                <Text style={styles.modalTitle}>
                  {new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate.date).toLocaleDateString(
                    'en-US',
                    { weekday: 'long', month: 'long', day: 'numeric' }
                  )}
                </Text>

                {selectedDate.isHoliday && selectedDate.holiday ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>🎉 Holiday</Text>
                    <Text style={styles.modalValue}>{selectedDate.holiday.name}</Text>
                    <StatusBadge status="holiday" label={selectedDate.holiday.type} />
                  </View>
                ) : null}

                {selectedDate.isLeaveApproved ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>✓ Approved Leave</Text>
                    <Text style={styles.modalValue}>Your leave has been approved</Text>
                    <StatusBadge status="approved" />
                  </View>
                ) : null}

                {selectedDate.isLeavePending ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>⏳ Pending Leave</Text>
                    <Text style={styles.modalValue}>Awaiting approval</Text>
                    <StatusBadge status="pending" />
                  </View>
                ) : null}

                {!selectedDate.isHoliday && !selectedDate.isLeaveApproved && !selectedDate.isLeavePending ? (
                  selectedDate.isWeekend ? (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>🏖️ Weekend (Off Day)</Text>
                      <Text style={styles.modalValue}>Saturday / Sunday Weekend Off</Text>
                    </View>
                  ) : (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>📅 Regular Working Day</Text>
                      <Text style={styles.modalValue}>No holidays or leave scheduled</Text>
                    </View>
                  )
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Theme.typography.bodyText,
    marginTop: Theme.spacing.md,
  },

  // Header
  header: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
  },
  title: {
    ...Theme.typography.sectionTitle,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    ...Theme.typography.caption,
  },
  boldText: {
    fontWeight: 'bold',
    color: Theme.colors.primary,
  },

  // Month Navigation
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  navButton: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.primaryLight,
  },
  navButtonText: {
    ...Theme.typography.bodyText,
    color: Theme.colors.primary,
    fontWeight: '600',
  },
  monthTitle: {
    ...Theme.typography.cardTitle,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Theme.typography.caption,
    fontSize: 11,
  },

  // Calendar
  calendarContainer: {
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    backgroundColor: Theme.colors.white,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    ...Theme.shadows.elevation2,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: Theme.spacing.md,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    ...Theme.typography.caption,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  datesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dateCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Theme.borderRadius.sm,
    position: 'relative',
  },
  dateText: {
    ...Theme.typography.bodyText,
    fontWeight: '500',
  },
  dateIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 10,
  },

  // Holidays List
  holidaysList: {
    paddingHorizontal: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
  },
  holidayItem: {
    flexDirection: 'row',
    paddingVertical: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  holidayLeft: {
    marginRight: Theme.spacing.md,
  },
  holidayDate: {
    ...Theme.typography.cardTitle,
    color: Theme.colors.primary,
  },
  holidayContent: {
    flex: 1,
  },
  holidayName: {
    ...Theme.typography.bodyText,
    marginBottom: Theme.spacing.xs,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Theme.spacing.md,
  },
  emptyText: {
    ...Theme.typography.bodyText,
    color: Theme.colors.textSecondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.white,
    borderTopLeftRadius: Theme.borderRadius.lg,
    borderTopRightRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    paddingTop: Theme.spacing.xl,
  },
  closeButton: {
    position: 'absolute',
    top: Theme.spacing.md,
    right: Theme.spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: Theme.colors.text,
  },
  modalTitle: {
    ...Theme.typography.sectionTitle,
    marginBottom: Theme.spacing.lg,
  },
  modalSection: {
    marginBottom: Theme.spacing.lg,
  },
  modalLabel: {
    ...Theme.typography.caption,
    marginBottom: Theme.spacing.sm,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  modalValue: {
    ...Theme.typography.bodyText,
    marginBottom: Theme.spacing.md,
  },
});
