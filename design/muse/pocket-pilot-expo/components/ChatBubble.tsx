import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { ChatMessage } from '../types';

export type ChatBubbleProps = {
  message: ChatMessage;
};

/** Coach (left, surface) vs user (right, accent). Max width keeps lines readable. */
function ChatBubble({ message }: ChatBubbleProps) {
  const { theme } = useTheme();
  const isUser = message.role === 'user';
  const styles = StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: theme.spacing.md,
    },
    bubble: {
      maxWidth: '82%',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: isUser ? theme.colors.accent : theme.colors.elevated,
      borderWidth: isUser ? 0 : 1,
      borderColor: theme.colors.border,
      minHeight: 44,
      justifyContent: 'center',
    },
    text: {
      color: isUser ? theme.colors.onAccent : theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.body,
    },
  });

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.bubble}
        accessibilityRole="text"
        accessibilityLabel={`${isUser ? 'You' : 'Coach'}: ${message.text}`}
      >
        <Text style={styles.text}>{message.text}</Text>
      </View>
    </View>
  );
}

export default memo(ChatBubble);
