import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { api } from "../../api";
import PressScale from "../../components/PressScale";
import { lightTap } from "../../haptics";
import { colors, spacing, radius, font, type, shadow, hit } from "../../theme";

// ── Types ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  isTyping?: boolean;
}

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingDots() {
  const reduce = useReducedMotion();

  const dot0 = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    const pulse = (sv: typeof dot0, delay: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(0, { duration: delay }),
          withTiming(-5, { duration: 220 }),
          withTiming(0, { duration: 220 }),
          withTiming(0, { duration: 500 }),
        ),
        -1,
        false
      );
    };
    pulse(dot0, 0);
    pulse(dot1, 140);
    pulse(dot2, 280);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const s0 = useAnimatedStyle(() => ({ transform: [{ translateY: dot0.value }] }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, s0]} />
      <Animated.View style={[styles.dot, s1]} />
      <Animated.View style={[styles.dot, s2]} />
    </View>
  );
}

// ── Suggestion chips ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Why did my score drop?",
  "How do late fees work?",
  "Secured vs regular card?",
  "Is my annual fee worth it?",
];

// ── ID helpers ────────────────────────────────────────────────────────────

let msgId = 0;
const nextId = () => String(++msgId);
const TYPING_ID = "__typing__";

// ── Message bubble ────────────────────────────────────────────────────────

function MessageBubble({ item }: { item: Message }) {
  const reduce = useReducedMotion();

  if (item.isTyping) {
    return (
      <Animated.View
        entering={reduce ? undefined : FadeInUp.duration(200)}
        style={[styles.bubbleWrap, styles.bubbleWrapAssistant]}
      >
        <View style={styles.assistantBubble}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={11} color={colors.coach} />
          </View>
          <TypingDots />
        </View>
      </Animated.View>
    );
  }

  const isUser = item.role === "user";
  const isOffline =
    typeof item.source === "string" && item.source.startsWith("offline");

  return (
    <Animated.View
      entering={reduce ? undefined : FadeInUp.duration(220).springify()}
      style={[
        styles.bubbleWrap,
        isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant,
      ]}
    >
      {isUser ? (
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{item.content}</Text>
        </View>
      ) : (
        <View style={styles.assistantBubble}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={11} color={colors.coach} />
          </View>
          <Text style={styles.assistantText}>{item.content}</Text>
        </View>
      )}

      {isOffline && (
        <View style={[styles.offlineChip, isUser && { alignSelf: "flex-end" }]}>
          <Ionicons name="warning" size={11} color={colors.warn} />
          <Text style={styles.offlineText}>Offline · {item.source}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Coach screen ──────────────────────────────────────────────────────────

export default function CoachScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const scrollToEnd = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    lightTap();
    setInput("");

    const history = messages
      .filter((m) => !m.isTyping)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: Message = { id: nextId(), role: "user", content: q };
    const typingMsg: Message = { id: TYPING_ID, role: "assistant", content: "", isTyping: true };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setLoading(true);
    scrollToEnd();

    try {
      const res = await api.coach(q, history);
      const assistantMsg: Message = {
        id: nextId(),
        role: "assistant",
        content: res.answer,
        source: res.source,
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== TYPING_ID),
        assistantMsg,
      ]);
    } catch (e: unknown) {
      const errMsg: Message = {
        id: nextId(),
        role: "assistant",
        content: e instanceof Error ? e.message : "Couldn't reach the server.",
        source: "offline (network error)",
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== TYPING_ID),
        errMsg,
      ]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={17} color={colors.coach} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ask Coach</Text>
            <Text style={styles.headerSub}>Powered by Claude</Text>
          </View>
          <Text style={styles.disclaimer}>Not financial advice.</Text>
        </View>

        {/* Empty state */}
        {!hasMessages ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyAvatar}>
              <Ionicons name="chatbubble-ellipses" size={30} color={colors.coach} />
            </View>
            <Text style={styles.emptyTitle}>I'm your credit coach</Text>
            <Text style={styles.emptySub}>
              Ask me anything about your cards, interest, or how to optimise your spending.
            </Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <PressScale
                  key={s}
                  onPress={() => send(s)}
                  disabled={loading}
                  accessibilityLabel={s}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </PressScale>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble item={item} />}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToEnd}
          />
        )}

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={colors.muted}
            multiline
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => send(input)}
          />
          <PressScale
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            accessibilityLabel="Send"
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendDisabled,
            ]}
          >
            <Ionicons name="arrow-up" size={17} color={colors.onPrimary} />
          </PressScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: hit.min + spacing.sm,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.coachFill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  headerSub: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    marginTop: 1,
  },
  disclaimer: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    fontStyle: "italic",
    flexShrink: 1,
    textAlign: "right",
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  emptyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.coachFill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontFamily: type.uiBold,
    textAlign: "center",
  },
  emptySub: {
    color: colors.muted,
    fontSize: font.body,
    fontFamily: type.ui,
    textAlign: "center",
    lineHeight: 22,
  },
  chips: { width: "100%", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: hit.min,
    justifyContent: "center",
    ...shadow.soft,
  },
  chipText: {
    color: colors.coach,
    fontSize: font.body,
    fontFamily: type.uiMedium,
  },

  // Message list
  messageList: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  // Bubble layout
  bubbleWrap: { gap: 4 },
  bubbleWrapUser: { alignItems: "flex-end" },
  bubbleWrapAssistant: { alignItems: "flex-start" },

  // User bubble — near-black fill, white text
  userBubble: {
    maxWidth: "82%",
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderBottomRightRadius: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  userText: {
    color: colors.onPrimary,
    fontSize: font.body,
    fontFamily: type.ui,
    lineHeight: 22,
  },

  // Assistant bubble — white surface, indigo avatar
  assistantBubble: {
    maxWidth: "82%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderBottomLeftRadius: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadow.soft,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.coachFill,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  assistantText: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    lineHeight: 22,
    flex: 1,
  },

  // Offline chip
  offlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  offlineText: {
    color: colors.warn,
    fontSize: font.label,
    fontFamily: type.uiMedium,
  },

  // Typing dots
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.coach,
    opacity: 0.6,
  },

  // Input row
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.ui,
    maxHeight: 120,
    minHeight: hit.min,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: colors.surfaceSubtle },
});
