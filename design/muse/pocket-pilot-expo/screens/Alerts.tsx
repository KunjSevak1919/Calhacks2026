import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { AlertItem } from '../types';
import AlertCard from '../components/AlertCard';
import PrimaryButton from '../components/PrimaryButton';
import Skeleton from '../components/Skeleton';

export type AlertsScreenProps = {
  alerts: AlertItem[];
  /** Fired when an alert's primary action completes (after the check/collapse, when applicable). */
  onAlertPrimary: (alert: AlertItem) => void;
  onAlertSecondary: (alert: AlertItem) => void;
  /** Optional confirmation banner, e.g. after an approval is recorded by the parent. */
  confirmationMessage?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

function AlertsScreen({
  alerts,
  onAlertPrimary,
  onAlertSecondary,
  confirmationMessage,
  loading,
  error,
  onRetry,
}: AlertsScreenProps) {
  const { theme } = useTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: {
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
      gap: theme.spacing.lg,
    },
    heading: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.title,
    },
    confirmation: {
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.success,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
    },
    confirmationText: {
      color: theme.colors.success,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing.xl,
      gap: theme.spacing.lg,
    },
    centerText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.body,
      textAlign: 'center',
    },
  });

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Skeleton height={140} borderRadius={theme.radius.lg} />
        <Skeleton height={140} borderRadius={theme.radius.lg} />
        <Skeleton height={140} borderRadius={theme.radius.lg} />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>Can&apos;t reach the server. Nothing was paid.</Text>
        {onRetry ? <PrimaryButton title="Try again" onPress={onRetry} /> : null}
      </View>
    );
  }

  if (alerts.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>You&apos;re all caught up.</Text>
        <Text style={styles.centerText}>No alerts need your attention right now.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Alerts</Text>
      {confirmationMessage ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmationText}>{confirmationMessage}</Text>
        </View>
      ) : null}
      {alerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onPrimary={onAlertPrimary}
          onSecondary={onAlertSecondary}
        />
      ))}
    </ScrollView>
  );
}

export default memo(AlertsScreen);
