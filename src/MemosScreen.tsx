import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, ChevronLeft, FileWarning } from 'lucide-react-native';
import { apiService } from './services/api';
import { Screen, Card, Button, EmptyState, StatusBadge, useTheme } from './components/ui';
import { showToast } from './utils/toast';
import { typography } from './theme';

type Memo = {
  _id: string;
  referenceNumber: string;
  issueType: string;
  warningMessage: string;
  violationCount: number;
  violationDates: string[];
  attendanceSummary?: {
    windowDays?: number;
    totalCheckIns?: number;
    missedPct?: number;
    riskLevel?: string;
  };
  status: 'issued' | 'acknowledged' | 'closed';
  issuedBy: string;
  issuedAt?: string;
  createdAt: string;
};

const STATUS_DISPLAY: Record<Memo['status'], { tone: 'warning' | 'info' | 'neutral'; label: string }> = {
  issued: { tone: 'warning', label: 'NEEDS ACKNOWLEDGEMENT' },
  acknowledged: { tone: 'info', label: 'ACKNOWLEDGED' },
  closed: { tone: 'neutral', label: 'CLOSED' },
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function MemosScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Memo | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    const res = await apiService.getMyMemos();
    if (res.success) {
      setMemos(res.data?.memos || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  const handleAcknowledge = async () => {
    if (!selected) return;
    setAcknowledging(true);
    const res = await apiService.acknowledgeMemo(selected._id);
    if (res.success) {
      showToast({ type: 'success', title: 'Memo acknowledged' });
      const updated = res.data?.memo;
      setSelected(updated || { ...selected, status: 'acknowledged' });
      fetchMemos();
    } else {
      showToast({ type: 'error', title: res.error || 'Failed to acknowledge memo' });
    }
    setAcknowledging(false);
  };

  const renderList = () => (
    <ScrollView style={styles.tabContainer} contentContainerStyle={styles.scrollContent}>
      {loading ? (
        <Text style={{ textAlign: 'center', marginTop: 20, color: colors.textMuted }}>Loading...</Text>
      ) : memos.length === 0 ? (
        <EmptyState
          icon={FileWarning}
          title="No warnings"
          message="Any compliance warning memos issued against you will appear here."
        />
      ) : (
        memos.map((m) => {
          const meta = STATUS_DISPLAY[m.status] || STATUS_DISPLAY.closed;
          return (
            <TouchableOpacity key={m._id} activeOpacity={0.7} onPress={() => setSelected(m)}>
              <Card style={[styles.card, { marginBottom: 12 }]}>
                <View style={styles.historyHeader}>
                  <Text style={[typography.title, { color: colors.text }]} numberOfLines={1}>
                    {m.issueType}
                  </Text>
                  <StatusBadge status={meta.tone} label={meta.label} size="small" />
                </View>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                  Ref: {m.referenceNumber} · {fmtDate(m.issuedAt || m.createdAt)}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}
                  numberOfLines={2}
                >
                  {m.warningMessage}
                </Text>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  const renderDetail = () => {
    if (!selected) return null;
    const meta = STATUS_DISPLAY[selected.status] || STATUS_DISPLAY.closed;
    return (
      <ScrollView style={styles.tabContainer} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <View style={styles.historyHeader}>
            <Text style={[typography.h3, { color: colors.text }]}>{selected.issueType}</Text>
            <StatusBadge status={meta.tone} label={meta.label} size="small" />
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Ref. No.: {selected.referenceNumber}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Issued: {fmtDate(selected.issuedAt || selected.createdAt)} by {selected.issuedBy}
          </Text>

          <View style={[styles.warnBox, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <AlertTriangle size={16} color={colors.warning} />
              <Text style={[typography.title, { color: colors.text, marginLeft: 6 }]}>Warning</Text>
            </View>
            <Text style={[typography.body, { color: colors.text }]}>{selected.warningMessage}</Text>
          </View>

          <Text style={[typography.title, { color: colors.text, marginTop: 16, marginBottom: 6 }]}>Details</Text>
          <View style={[styles.detailRow, { borderColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Analysis Window</Text>
            <Text style={[typography.caption, { color: colors.text }]}>
              Last {selected.attendanceSummary?.windowDays ?? '—'} days
            </Text>
          </View>
          <View style={[styles.detailRow, { borderColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Missed Checkouts</Text>
            <Text style={[typography.caption, { color: colors.text }]}>
              {selected.violationCount} ({selected.attendanceSummary?.missedPct ?? 0}%)
            </Text>
          </View>
          <View style={[styles.detailRow, { borderColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Violation Dates</Text>
            <Text style={[typography.caption, { color: colors.text, flex: 1, textAlign: 'right' }]}>
              {(selected.violationDates || []).join(', ') || '—'}
            </Text>
          </View>

          {selected.status === 'issued' && (
            <Button
              title="Acknowledge Warning"
              onPress={handleAcknowledge}
              loading={acknowledging}
              style={{ marginTop: 20 }}
            />
          )}
        </Card>
      </ScrollView>
    );
  };

  return (
    <Screen scroll={false} edges={['left', 'right']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => (selected ? setSelected(null) : navigation.goBack())}
          style={{
            marginRight: 12,
            padding: 6,
            borderRadius: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[typography.h2, { color: colors.text }]}>
            {selected ? 'Warning Detail' : 'Compliance Warnings'}
          </Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {selected ? 'Review details of policy warning' : 'Track policy warnings & memos'}
          </Text>
        </View>
      </View>

      {selected ? renderDetail() : renderList()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  tabContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warnBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
