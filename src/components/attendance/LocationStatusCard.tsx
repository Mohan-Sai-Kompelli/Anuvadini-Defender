/**
 * LocationStatusCard — geofence status for the attendance hub.
 *
 * Purely presentational: receives the geofence state computed by the screen
 * and renders an animated ProgressRing ("inside/outside zone"), the distance
 * to the organization, GPS accuracy and a refresh action.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  House,
  LoaderCircle,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ProgressRing } from '../ui/ProgressRing';
import { Skeleton } from '../ui/Skeleton';
import { useTheme } from '../../design/ThemeContext';

export type GeofenceStatus = 'checking' | 'within' | 'borderline' | 'outside' | 'error';

export interface WFHInfo {
  reason?: string;
  daysRemaining?: number;
  startDate?: string;
  endDate?: string;
}

export interface LocationStatusCardProps {
  /** Geofence state machine value from the screen. */
  status: GeofenceStatus;
  /** Human-readable status line (already WFH-aware). */
  statusText: string;
  /** Distance from the organization in meters, null while unknown. */
  distance: number | null;
  /** Geofence radius in meters. */
  areaRadius: number;
  /** GPS accuracy in meters (optional). */
  accuracy?: number | null;
  /** Organization name shown under the distance. */
  organizationName?: string;
  organizationAddress?: string;
  /** Work-from-home overrides the geofence ring. */
  wfhActive?: boolean;
  wfhDetails?: WFHInfo | null;
  onRefresh: () => void;
  refreshing?: boolean;
  enteringIndex?: number;
}

function formatMeters(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }
  return `${Math.round(value)} m`;
}

function LocationStatusCardImpl({
  status,
  statusText,
  distance,
  areaRadius,
  accuracy,
  organizationName,
  organizationAddress,
  wfhActive = false,
  wfhDetails,
  onRefresh,
  refreshing = false,
  enteringIndex,
}: LocationStatusCardProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii } = theme;

  // --- ring state -----------------------------------------------------------
  const inZone = wfhActive || status === 'within';
  const checking = !wfhActive && status === 'checking';

  let ringColor = colors.textMuted;
  let CenterIcon: LucideIcon = MapPin;
  let centerIconColor = colors.textMuted;
  let zoneLabel = 'Locating…';

  if (wfhActive) {
    const expired =
      wfhDetails?.daysRemaining !== undefined && wfhDetails.daysRemaining <= 0;
    const expiring =
      wfhDetails?.daysRemaining !== undefined &&
      wfhDetails.daysRemaining > 0 &&
      wfhDetails.daysRemaining <= 2;
    ringColor = expired
      ? colors.danger
      : expiring
        ? colors.warning
        : colors.success;
    CenterIcon = House;
    centerIconColor = ringColor;
    zoneLabel = 'In Range';
  } else if (status === 'within') {
    ringColor = colors.success;
    CenterIcon = MapPin;
    centerIconColor = colors.success;
    zoneLabel = 'In Range';
  } else if (status === 'borderline') {
    // Just outside the radius but close enough it could be GPS drift rather
    // than a genuine move away — a distinct yellow, not yet a hard "outside".
    ringColor = colors.warning;
    CenterIcon = MapPin;
    centerIconColor = colors.warning;
    zoneLabel = 'Near Boundary';
  } else if (status === 'outside') {
    ringColor = colors.danger;
    CenterIcon = MapPin;
    centerIconColor = colors.danger;
    zoneLabel = 'Outside Range';
  } else if (status === 'error') {
    ringColor = colors.danger;
    CenterIcon = TriangleAlert;
    centerIconColor = colors.danger;
    zoneLabel = 'Error';
  } else {
    CenterIcon = LoaderCircle;
    zoneLabel = 'Locating…';
  }

  // Ring fill: full when inside the zone (or WFH), proportional proximity
  // when outside, empty while checking / on error.
  let progress = 0;
  if (inZone) {
    progress = 1;
  } else if ((status === 'outside' || status === 'borderline') && distance != null && distance > 0) {
    progress = Math.max(0.06, Math.min(0.96, areaRadius / distance));
  }

  const statusColor = wfhActive
    ? ringColor
    : status === 'within'
      ? colors.success
      : status === 'borderline'
        ? colors.warning
        : status === 'outside' || status === 'error'
          ? colors.danger
          : colors.textMuted;

  return (
    <Card
      elevation={2}
      enteringIndex={enteringIndex}
      accessibilityLabel={`Location status: ${statusText}`}
    >
      {/* Title row */}
      <View style={[styles.titleRow, { marginBottom: spacing.lg }]}>
        <View style={[styles.headerIconBadge, { backgroundColor: '#0EA5E9' }]}>
          <MapPin size={17} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <Text
          style={[typography.title, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}
          numberOfLines={1}
        >
          Location Status
        </Text>
      </View>

      <View style={styles.bodyRow}>
        {/* Geofence ring */}
        <View style={styles.ringColumn}>
          {checking && distance == null ? (
            <Skeleton width={96} height={96} radius={48} />
          ) : (
            <ProgressRing
              progress={progress}
              size={96}
              strokeWidth={8}
              color={ringColor}
              trackColor={colors.surfaceAlt}
            >
              <CenterIcon size={28} color={centerIconColor} />
            </ProgressRing>
          )}
          <Text
            style={[
              typography.caption,
              { color: statusColor, marginTop: spacing.sm },
            ]}
          >
            {zoneLabel}
          </Text>
        </View>

        {/* Status details */}
        <View style={[styles.detailsColumn, { marginLeft: spacing.lg }]}>
          <Text
            style={[typography.bodyBold, { color: statusColor }]}
            accessibilityLiveRegion="polite"
          >
            {statusText}
          </Text>

          {checking && distance == null ? (
            <View style={{ marginTop: spacing.sm }}>
              <Skeleton width="80%" height={12} />
              <Skeleton width="55%" height={12} style={{ marginTop: spacing.sm }} />
            </View>
          ) : (
            <>
              {/* Distance intentionally hidden — we don't show how far the user is. */}
              {!wfhActive && accuracy != null && (
                <Text
                  style={[
                    typography.small,
                    { color: colors.textMuted, marginTop: spacing.xs },
                  ]}
                >
                  GPS accuracy ±{formatMeters(accuracy)}
                </Text>
              )}
              {(() => {
                const rawName = typeof organizationName === 'string' ? organizationName : 'Anuvadini Foundation';
                let formattedName = rawName.replace(/\bAnuvadini\b(?!\s+Foundation)/gi, 'Anuvadini Foundation');

                let rawAddr = typeof organizationAddress === 'string' ? organizationAddress : '';
                if (typeof organizationAddress === 'object' && organizationAddress !== null) {
                  const a: any = organizationAddress;
                  rawAddr = a.formattedAddress || a.street || a.address || '';
                }

                let address = rawAddr || 'AICTE Campus, Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070';

                if (/netf/i.test(formattedName)) {
                  formattedName = 'NETF (National Educational Technology Forum)';
                  if (!rawAddr) {
                    address = 'AICTE Campus, Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070';
                  }
                } else if (/iuac/i.test(formattedName)) {
                  formattedName = 'IUAC (Inter-University Accelerator Centre)';
                  if (!rawAddr) {
                    address = 'Aruna Asaf Ali Marg, Near JNU, New Delhi - 110067';
                  }
                }

                return (
                  <View style={{ marginTop: spacing.xs }}>
                    <Text
                      style={[
                        typography.small,
                        { color: colors.text, fontWeight: '700' },
                      ]}
                    >
                      {formattedName}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.textMuted, marginTop: 2, fontSize: 11.5, lineHeight: 15 },
                      ]}
                    >
                      {address}
                    </Text>
                  </View>
                );
              })()}
              {wfhActive && wfhDetails?.reason ? (
                <Text
                  style={[
                    typography.small,
                    {
                      color: colors.textMuted,
                      fontStyle: 'italic',
                      marginTop: spacing.xs,
                    },
                  ]}
                >
                  Reason: {wfhDetails.reason}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      {/* WFH pill */}
      {/* wfhActive && (
        <View
          style={[
            styles.wfhPill,
            {
              backgroundColor: colors.successSoft,
              borderRadius: radii.pill,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              marginTop: spacing.lg,
            },
          ]}
        >
          <House size={14} color={colors.success} />
          <Text
            style={[
              typography.caption,
              { color: colors.success, marginLeft: spacing.xs },
            ]}
          >
            Work from home active — location check skipped
          </Text>
        </View>
      ) */}

      <Button
        title={refreshing || status === 'checking' ? 'Checking…' : 'Refresh status'}
        onPress={onRefresh}
        variant="outline"
        size="sm"
        icon={RefreshCw}
        loading={refreshing || status === 'checking'}
        disabled={status === 'checking'}
        hapticType="selection"
        accessibilityLabel="Refresh location status"
        accessibilityHint="Re-checks your location and attendance eligibility"
        style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}
      />
    </Card>
  );
}

// Note: this card's own props (status/distance/accuracy) genuinely change on
// most GPS ticks, so memo won't skip as many re-renders here as the other
// components fixed alongside it — added anyway for the ticks where nothing
// actually changed (e.g. two identical distance readings back to back) and
// for consistency/protection against unrelated parent re-renders.
export const LocationStatusCard = React.memo(LocationStatusCardImpl);

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringColumn: {
    alignItems: 'center',
  },
  detailsColumn: {
    flex: 1,
  },
  wfhPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
