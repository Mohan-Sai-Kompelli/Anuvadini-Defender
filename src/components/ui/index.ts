/**
 * SAACMS UI kit barrel. Import everything from 'src/components/ui'.
 */
export { AppHeader } from './AppHeader';
export type { AppHeaderProps } from './AppHeader';
export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { ConfirmSheet } from './ConfirmSheet';
export type { ConfirmSheetProps } from './ConfirmSheet';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { GlassBackdrop } from './GlassBackdrop';
export type { GlassBackdropProps } from './GlassBackdrop';
export { GlassCard } from './GlassCard';
export type { GlassCardProps } from './GlassCard';
export { Input } from './Input';
export type { InputProps } from './Input';
export { ProgressRing } from './ProgressRing';
export type { ProgressRingProps } from './ProgressRing';
export { QuickActionButton } from './QuickActionButton';
export type { QuickActionButtonProps } from './QuickActionButton';
export { Screen } from './Screen';
export type { ScreenProps } from './Screen';
export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps } from './SegmentedControl';
export { Skeleton, SkeletonCard, SkeletonRow } from './Skeleton';
export type {
  SkeletonCardProps,
  SkeletonProps,
  SkeletonRowProps,
} from './Skeleton';
export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';
export { StatusBadge } from './StatusBadge';
export type { Status, StatusBadgeProps, StatusTone } from './StatusBadge';
export { Timeline } from './Timeline';
export type { TimelineEvent, TimelineProps } from './Timeline';

// Convenience re-exports so screens can grab theming from the kit.
export { ThemeProvider, useTheme } from '../../design/ThemeContext';
export type {
  ThemeContextValue,
  ThemeMode,
  ThemeScheme,
} from '../../design/ThemeContext';
export type { AppTheme, ThemeColors } from '../../design/tokens';
