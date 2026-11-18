import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { MapPin } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  subtitle?: string;
  location?: string;
  /** Lucide icon component preferred; legacy emoji strings still render. */
  icon?: LucideIcon | string;
  color?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
}

export const Timeline: React.FC<TimelineProps> = ({ events }) => {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;

  const renderEventIcon = (icon?: TimelineEvent['icon'], tint?: string) => {
    if (!icon) {
      return null;
    }
    if (typeof icon === 'string') {
      return (
        <Text style={[styles.emojiIcon, { marginRight: spacing.xs }]}>{icon}</Text>
      );
    }
    const IconCmp = icon;
    return (
      <View style={{ marginRight: spacing.xs }}>
        <IconCmp size={14} color={tint ?? colors.brand} strokeWidth={2.25} />
      </View>
    );
  };

  const renderEvent = ({
    item,
    index,
  }: {
    item: TimelineEvent;
    index: number;
  }) => {
    const isLast = index === events.length - 1;
    const color = item.color || colors.brand;

    return (
      <Animated.View
        entering={FadeInDown.duration(300)
          .delay(index * 50)
          .reduceMotion(ReduceMotion.System)}
        style={[styles.eventContainer, { marginBottom: spacing.xl }]}
      >
        <View style={[styles.timelineColumn, { marginRight: spacing.md }]}>
          <View
            style={[
              styles.dot,
              { backgroundColor: color, borderColor: colors.surface },
            ]}
          />
          {!isLast ? (
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          ) : null}
        </View>

        <View style={styles.contentColumn}>
          <View style={[styles.timeRow, { marginBottom: spacing.xs }]}>
            {renderEventIcon(item.icon, color)}
            <Text
              style={[
                typography.caption,
                styles.timeText,
                { color: colors.textMuted },
              ]}
            >
              {item.time}
            </Text>
          </View>

          <Text style={[typography.bodyBold, { color: colors.text }]}>
            {item.title}
          </Text>

          {item.subtitle ? (
            <Text
              style={[
                typography.caption,
                { color: colors.textMuted, marginTop: 2 },
              ]}
            >
              {item.subtitle}
            </Text>
          ) : null}

          {item.location ? (
            <View style={[styles.locationRow, { marginTop: spacing.xs }]}>
              <MapPin size={12} color={colors.brand} strokeWidth={2.25} />
              <Text
                style={[
                  typography.caption,
                  styles.locationText,
                  { color: colors.brand },
                ]}
                numberOfLines={1}
              >
                {item.location}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={{ paddingVertical: spacing.md }}>
      <FlatList
        scrollEnabled={false}
        data={events}
        renderItem={renderEvent}
        keyExtractor={item => item.id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  eventContainer: {
    flexDirection: 'row',
  },
  timelineColumn: {
    alignItems: 'center',
    width: 28,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 6,
  },
  contentColumn: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontWeight: '500',
    marginLeft: 4,
  },
  emojiIcon: {
    fontSize: 14,
  },
});
