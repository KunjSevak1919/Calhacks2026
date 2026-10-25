import React, { memo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import type { ChatMessage, PaybackComparisonData } from '../types';
import ChatBubble from '../components/ChatBubble';
import PaybackComparison from '../components/PaybackComparison';
import PrimaryButton from '../components/PrimaryButton';
import Skeleton from '../components/Skeleton';
import StoreChip from '../components/StoreChip';

export type CoachScreenProps = {
  messages: ChatMessage[];
  suggestions: string[];
  onSuggestion: (suggestion: string) => void;
  onSend: (text: string) => void;
  payback: PaybackComparisonData;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

function CoachScreen({
  messages,
  suggestions,
  onSuggestion,
  onSend,
  payback,
  loading,
  error,
  onRetry,
}: CoachScreenProps) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState('');

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
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    composer: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      minHeight: 48,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.lg,
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.medium,
    },
    send: {
      minWidth: 48,
      minHeight: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    sendText: {
      color: theme.colors.onAccent,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.body,
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
        <Skeleton height={64} borderRadius={theme.radius.lg} />
        <Skeleton height={64} borderRadius={theme.radius.lg} width="82%" />
        <Skeleton height={120} borderRadius={theme.radius.lg} />
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

  if (messages.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.centerText}>Ask Coach anything about your cards.</Text>
        <Text style={styles.centerText}>Answers are in plain words, with the numbers shown.</Text>
        <View style={styles.chips}>
          {suggestions.map((suggestion) => (
            <StoreChip key={suggestion} label={suggestion} onPress={() => onSuggestion(suggestion)} />
          ))}
        </View>
      </View>
    );
  }

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.heading}>Ask Coach</Text>
        <Text style={styles.subtitle}>Claude-powered answers in plain words.</Text>
      </View>

      <View>
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
      </View>

      <PaybackComparison data={payback} />

      <View style={styles.chips}>
        {suggestions.map((suggestion) => (
          <StoreChip key={suggestion} label={suggestion} onPress={() => onSuggestion(suggestion)} />
        ))}
      </View>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about interest, fees, or paying down a card"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Message Coach"
          style={styles.input}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <PrimaryButton
          title="Send"
          onPress={handleSend}
          accessibilityLabel="Send message to Coach"
        />
      </View>
    </ScrollView>
  );
}

export default memo(CoachScreen);
