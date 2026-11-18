/**
 * EmployeeInfoCard — compact identity card for the attendance hub.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Building2, UserRound } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { useTheme } from '../../design/ThemeContext';

export interface EmployeeInfoCardProps {
  name?: string;
  uid?: string;
  organizationName?: string;
  enteringIndex?: number;
}

export function EmployeeInfoCard({
  name,
  uid,
  organizationName,
  enteringIndex,
}: EmployeeInfoCardProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii } = theme;

  return (
    <Card
      elevation={1}
      enteringIndex={enteringIndex}
      accessibilityLabel={`Employee ${name ?? ''}${uid ? `, UID ${uid}` : ''}${
        organizationName ? `, ${organizationName}` : ''
      }`}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.brandSoft, borderRadius: radii.pill },
          ]}
        >
          <UserRound size={22} color={colors.brand} />
        </View>
        <View style={[styles.info, { marginLeft: spacing.md }]}>
          <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={1}>
            {name ?? 'Employee'}
          </Text>
          {uid ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              UID: {uid}
            </Text>
          ) : null}
          {organizationName ? (
            <View style={[styles.orgRow, { marginTop: spacing.xs }]}>
              <Building2 size={12} color={colors.textMuted} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.textMuted, marginLeft: spacing.xs },
                ]}
                numberOfLines={1}
              >
                {organizationName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
