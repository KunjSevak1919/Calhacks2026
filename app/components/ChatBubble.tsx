import React, { memo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatBubbleProps = {
  message: ChatMessage;
};

function ChatBubble({ message }: ChatBubbleProps) {
  const { colors } = useTheme();
  const isUser = message.role === "user";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: spacing.md,
      }}
    >
      <View
        style={{
          maxWidth: "82%",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: isUser ? colors.accent : colors.elevated,
          borderWidth: isUser ? 0 : 1,
          borderColor: colors.border,
          minHeight: 44,
          justifyContent: "center",
        }}
        accessibilityRole="text"
        accessibilityLabel={`${isUser ? "You" : "Coach"}: ${message.content}`}
      >
        <Text
          style={{
            color: isUser ? colors.onAccent : colors.text,
            fontSize: font.body,
            fontFamily: type.uiMedium,
            lineHeight: font.body * 1.5,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default memo(ChatBubble);
