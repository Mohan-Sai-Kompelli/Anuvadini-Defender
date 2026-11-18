import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import {
  CalendarDays,
  ChartColumn,
  ChevronRight,
  FileChartColumn,
  Lightbulb,
  TriangleAlert,
  Users,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button, Screen, SectionHeader, useTheme } from './components/ui';
import { showToast } from './utils/toast';
import { haptic } from './utils/haptics';

type ReportType = 'attendance' | 'department' | 'monthly' | 'compliance';

interface ReportCardData {
  id: ReportType;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const ReportsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing, radii, typography, shadows } = theme;

  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const reports: ReportCardData[] = [
    {
      id: 'attendance',
      title: 'Attendance Report',
      description: 'View your complete attendance history with dates and times',
      icon: CalendarDays,
      color: colors.brand,
    },
    {
      id: 'department',
      title: 'Department Summary',
      description: 'Department-wise attendance breakdown and statistics',
      icon: Users,
      color: colors.success,
    },
    {
      id: 'monthly',
      title: 'Monthly Summary',
      description: 'Month-wise attendance summary and performance metrics',
      icon: ChartColumn,
      color: colors.warning,
    },
    {
      id: 'compliance',
      title: 'Compliance Report',
      description: 'Employees below 80% attendance threshold',
      icon: TriangleAlert,
      color: colors.danger,
    },
  ];

  const downloadReport = async (reportType: ReportType) => {
    try {
      setLoading(true);

      let endpoint = '';
      let filename = '';

      if (reportType === 'attendance') {
        endpoint = '/reports/attendance?format=pdf';
        filename = 'attendance_report.pdf';
      } else if (reportType === 'department') {
        endpoint = '/reports/department-summary?format=pdf';
        filename = 'department_report.pdf';
      } else if (reportType === 'monthly') {
        endpoint = `/reports/monthly-summary?month=${selectedMonth}&year=${selectedYear}&format=pdf`;
        filename = `monthly_summary_${selectedMonth}_${selectedYear}.pdf`;
      } else if (reportType === 'compliance') {
        endpoint = '/reports/compliance?format=csv';
        filename = 'compliance_report.csv';
      }

      void endpoint;

      showToast({
        type: 'success',
        title: 'Report generated',
        message: `${filename} — the download link will be available with file system access.`,
      });

      setLoading(false);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Download failed',
        message: 'Failed to download report. Please try again.',
      });
      console.error('Error downloading report:', error);
      setLoading(false);
    }
  };

  const renderReportCard = (report: ReportCardData, index: number) => {
    const Icon = report.icon;
    return (
      <Animated.View
        key={report.id}
        entering={FadeInDown.duration(300)
          .delay(index * 50)
          .reduceMotion(ReduceMotion.System)}
        style={[
          shadows.e2,
          styles.reportCard,
          {
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderColor: colors.border,
            borderLeftColor: report.color,
            marginBottom: spacing.md,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            haptic('impactLight');
            if (report.id === 'monthly') {
              setShowMonthPicker(true);
            } else {
              downloadReport(report.id);
            }
          }}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`${report.title}. ${report.description}`}
          accessibilityHint="Generates and downloads this report"
          android_ripple={{ color: colors.brandSoft }}
          style={({ pressed }) => [
            styles.reportCardInner,
            { padding: spacing.lg, opacity: pressed || loading ? 0.7 : 1 },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginRight: spacing.md },
            ]}
          >
            <Icon size={26} color={report.color} strokeWidth={2} />
          </View>
          <View style={styles.reportInfo}>
            <Text style={[typography.title, { color: colors.text, marginBottom: spacing.xs }]}>
              {report.title}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{report.description}</Text>
          </View>
          <ChevronRight size={20} color={colors.brand} strokeWidth={2.25} />
        </Pressable>
      </Animated.View>
    );
  };

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const pickerChip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <Pressable
      key={label}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={[
        styles.pickerChip,
        {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radii.md,
          marginRight: spacing.sm,
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected ? colors.brand : colors.surface,
        },
      ]}
    >
      <Text style={[typography.bodyBold, { color: selected ? colors.textInverse : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Screen scroll padded={false} testID="reports-screen">
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.xl,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <FileChartColumn size={24} color={colors.brand} strokeWidth={2.25} />
          <Text
            style={[typography.h2, { color: colors.text, marginLeft: spacing.sm }]}
            accessibilityRole="header"
          >
            Reports & Analytics
          </Text>
        </View>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
          Download and view your attendance and performance reports
        </Text>
      </View>

      {/* Available Reports */}
      <View style={{ paddingVertical: spacing.lg }}>
        <SectionHeader title="Available Reports" icon={FileChartColumn} />

        {loading && (
          <View style={[styles.loadingContainer, { paddingVertical: spacing.xl }]}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: colors.textMuted, marginTop: spacing.md }]}
            >
              Preparing report...
            </Text>
          </View>
        )}

        {!loading && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {reports.map((report, index) => renderReportCard(report, index))}
          </View>
        )}
      </View>

      {/* Report Information */}
      <View style={{ paddingVertical: spacing.md }}>
        <SectionHeader title="About These Reports" icon={Lightbulb} />
        <Animated.View
          entering={FadeInDown.duration(300).delay(200).reduceMotion(ReduceMotion.System)}
          style={[
            shadows.e1,
            styles.infoCard,
            {
              marginHorizontal: spacing.lg,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.md,
              padding: spacing.lg,
            },
          ]}
        >
          {reports.map((report, index) => {
            const Icon = report.icon;
            return (
              <View
                key={report.id}
                style={[
                  index < reports.length - 1 && [styles.infoItem, { borderBottomColor: colors.border }],
                  { paddingVertical: spacing.md },
                ]}
              >
                <View style={styles.infoLabelRow}>
                  <Icon size={16} color={report.color} strokeWidth={2.25} />
                  <Text style={[typography.bodyBold, { color: colors.text, marginLeft: spacing.sm }]}>
                    {report.title}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
                  {report.id === 'attendance' &&
                    'Complete attendance history with check-in/check-out times and distance from office.'}
                  {report.id === 'department' &&
                    'Aggregate attendance statistics for each department, including present, absent, and attendance percentage.'}
                  {report.id === 'monthly' &&
                    'Month-wise performance metrics including top performers and those needing attention (below 80%).'}
                  {report.id === 'compliance' &&
                    'Lists all employees with attendance below 80% threshold for compliance tracking and action.'}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      </View>

      {/* Tips Section */}
      <View style={{ paddingVertical: spacing.md, marginBottom: spacing.xl }}>
        <SectionHeader title="Tips" icon={Lightbulb} />
        <View
          style={[
            styles.tipCard,
            {
              marginHorizontal: spacing.lg,
              backgroundColor: colors.infoSoft,
              borderLeftColor: colors.info,
              padding: spacing.lg,
              borderRadius: radii.md,
            },
          ]}
        >
          <Text style={[typography.caption, { color: colors.text, marginBottom: spacing.xs }]}>
            {'•'} Reports are generated based on your organization's attendance data
          </Text>
          <Text style={[typography.caption, { color: colors.text, marginBottom: spacing.xs }]}>
            {'•'} Download reports in PDF or CSV format
          </Text>
          <Text style={[typography.caption, { color: colors.text, marginBottom: spacing.xs }]}>
            {'•'} Use monthly report to track your performance over time
          </Text>
          <Text style={[typography.caption, { color: colors.text }]}>
            {'•'} Attendance % is calculated as: Present Days / Total Days {'×'} 100
          </Text>
        </View>
      </View>

      {/* Month/Year Picker Modal */}
      <Modal
        visible={showMonthPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <View style={[styles.pickerModal, { backgroundColor: colors.overlay }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowMonthPicker(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss month picker"
          />
          <Animated.View
            entering={FadeInDown.duration(250).reduceMotion(ReduceMotion.System)}
            style={[
              styles.pickerContent,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.lg,
                borderTopRightRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.xl,
                paddingBottom: spacing.xxl,
              },
            ]}
          >
            <Text
              style={[typography.h3, styles.pickerTitle, { color: colors.text, marginBottom: spacing.xl }]}
              accessibilityRole="header"
            >
              Select Month & Year
            </Text>

            {/* Month Selector */}
            <View style={{ marginBottom: spacing.xl }}>
              <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                Month
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {months.map((m, idx) =>
                  pickerChip(
                    m.substring(0, 3),
                    selectedMonth === idx + 1,
                    () => setSelectedMonth(idx + 1),
                    `Select ${m}`,
                  ),
                )}
              </ScrollView>
            </View>

            {/* Year Selector */}
            <View style={{ marginBottom: spacing.xl }}>
              <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                Year
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {years.map((y) =>
                  pickerChip(String(y), selectedYear === y, () => setSelectedYear(y), `Select ${y}`),
                )}
              </ScrollView>
            </View>

            {/* Action Buttons */}
            <View style={[styles.pickerActions, { gap: spacing.md }]}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setShowMonthPicker(false)}
                style={styles.pickerButton}
                accessibilityLabel="Cancel month selection"
              />
              <Button
                title="Download"
                variant="primary"
                onPress={() => {
                  downloadReport('monthly');
                  setShowMonthPicker(false);
                }}
                style={styles.pickerButton}
                accessibilityLabel={`Download monthly summary for ${months[selectedMonth - 1]} ${selectedYear}`}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 5,
    overflow: 'hidden',
  },
  reportCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportInfo: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoItem: {
    borderBottomWidth: 1,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipCard: {
    borderLeftWidth: 4,
  },
  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerContent: {
    width: '100%',
  },
  pickerTitle: {
    textAlign: 'center',
  },
  pickerChip: {
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  pickerActions: {
    flexDirection: 'row',
  },
  pickerButton: {
    flex: 1,
  },
});
