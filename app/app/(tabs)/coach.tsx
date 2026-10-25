import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { api, type PaybackResponse } from "../../api";
import { useTheme } from "../../ThemeContext";
import { font, type, spacing, radius, shadow, hit } from "../../theme";
import StoreChip from "../../components/StoreChip";
import PaybackComparison from "../../components/PaybackComparison";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvTurn = { role: "user" | "assistant"; content: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  isTyping?: boolean;
}

interface SendError {
  message: string;
  question: string;
  history: ConvTurn[];
}

const SUGGESTIONS = [
  "Why did my score drop?",
  "How do late fees work?",
  "Secured vs regular card?",
  "Is my annual fee worth it?",
];

let msgId = 0;
const nextId = () => String(++msgId);
const TYPING_ID = "__typing__";

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const d0 = useSharedValue(0);
  const d1 = useSharedValue(0);
  const d2 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    const pulse = (sv: typeof d0, delay: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(0, { duration: delay }),
          withTiming(-5, { duration: 220 }),
          withTiming(0, { duration: 220 }),
          withTiming(0, { duration: 500 })
        ),
        -1,
        false
      );
    };
    pulse(d0, 0);
    pulse(d1, 140);
    pulse(d2, 280);
  }, [reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const s0 = useAnimatedStyle(() => ({ transform: [{ translateY: d0.value }] }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: d1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: d2.value }] }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { backgroundColor: colors.coach }, s0]} />
      <Animated.View style={[styles.dot, { backgroundColor: colors.coach }, s1]} />
      <Animated.View style={[styles.dot, { backgroundColor: colors.coach }, s2]} />
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ item }: { item: Message }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const isOffline =
    typeof item.source === "string" && item.source.startsWith("offline");

  if (item.isTyping) {
    return (
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(200)}
        style={[styles.bubbleWrap, styles.bubbleWrapAssistant]}
      >
        <View style={[styles.assistantBubble, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.coachFill }]}>
            <Ionicons name="sparkles" size={11} color={colors.coach} />
          </View>
          <TypingDots />
        </View>
      </Animated.View>
    );
  }

  const isUser = item.role === "user";

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(220).springify()}
      style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant]}
    >
      {isUser ? (
        <View style={[styles.userBubble, { backgroundColor: colors.primary }]}>
          <Text style={[styles.userText, { color: colors.onPrimary }]}>{item.content}</Text>
        </View>
      ) : (
        <View style={[styles.assistantBubble, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.coachFill }]}>
            <Ionicons name="sparkles" size={11} color={colors.coach} />
          </View>
          <Text style={[styles.assistantText, { color: colors.text }]}>{item.content}</Text>
        </View>
      )}
      {isOffline && (
        <View style={[styles.offlineChip, isUser && { alignSelf: "flex-end" }]}>
          <Ionicons name="warning" size={11} color={colors.warn} />
          <Text style={[styles.offlineText, { color: colors.warn }]}>
            Offline · {item.source}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ error, onRetry }: { error: SendError; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.errorBanner, { backgroundColor: colors.warnFill, borderColor: colors.warn }]}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.warn} />
      <Text style={[styles.errorMsg, { color: colors.warn }]} numberOfLines={3}>
        {error.message}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityLabel="Retry"
        style={[styles.retryBtn, { backgroundColor: colors.warn }]}
      >
        <Text style={[styles.retryText, { color: "#fff" }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ── Coach screen ──────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const { colors } = useTheme();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [payback, setPayback] = useState<PaybackResponse | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    api.payback("aurum").then(setPayback).catch(() => {});
  }, []);

  const scrollToEnd = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const sendRequest = async (question: string, history: ConvTurn[]) => {
    setLoading(true);
    setSendError(null);

    const typingMsg: Message = { id: TYPING_ID, role: "assistant", content: "", isTyping: true };
    setMessages((prev) => [...prev, typingMsg]);
    scrollToEnd();

    try {
      const res = await api.coach(question, history);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== TYPING_ID),
        { id: nextId(), role: "assistant", content: res.answer, source: res.source },
      ]);
    } catch (e: unknown) {
      // Remove typing indicator; show error banner with retry capability
      setMessages((prev) => prev.filter((m) => m.id !== TYPING_ID));
      setSendError({
        message: e instanceof Error ? e.message : "Couldn't reach the server.",
        question,
        history,
      });
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setSendError(null);

    // Build history from successful exchanges only — no typing indicators, no error entries.
    // Slice to only {role, content}; first entry is always "user" since user always goes first.
    const history: ConvTurn[] = messages
      .filter((m) => !m.isTyping)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: Message = { id: nextId(), role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);

    await sendRequest(q, history);
  };

  const retry = async () => {
    if (!sendError || loading) return;
    // Remove the user message that failed (last in list) so it re-adds cleanly
    setMessages((prev) => {
      const last = [...prev].reverse().find((m) => m.role === "user");
      if (!last) return prev;
      return prev.filter((m) => m.id !== last.id);
    });
    const { question, history } = sendError;
    const userMsg: Message = { id: nextId(), role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    await sendRequest(question, history);
  };

  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !loading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>

        {/* Empty state — shown before first message */}
        {!hasMessages ? (
          <FlatList
            data={[]}
            renderItem={() => null}
            ListHeaderComponent={
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyAvatar, { backgroundColor: colors.coachFill }]}>
                  <Ionicons name="chatbubble-ellipses" size={30} color={colors.coach} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>I'm your credit coach</Text>
                <Text style={[styles.emptySub, { color: colors.muted }]}>
                  Ask me anything about your cards, interest, or how to optimise your spending.
                </Text>

                <View style={styles.chips}>
                  {SUGGESTIONS.map((s) => (
                    <StoreChip
                      key={s}
                      label={s}
                      onPress={() => send(s)}
                      accessibilityLabel={s}
                    />
                  ))}
                </View>

                {payback && (
                  <View style={{ width: "100%" }}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                      Aurum Gold payback insight
                    </Text>
                    <PaybackComparison data={payback} />
                  </View>
                )}
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble item={item} />}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToEnd}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Error banner — shown above input when last request failed */}
        {sendError && (
          <ErrorBanner error={sendError} onRetry={retry} />
        )}

        {/* Input bar */}
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor={colors.muted}
            multiline
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!canSend}
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: canSend ? colors.coach : colors.surfaceSubtle },
              pressed && canSend && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="arrow-up" size={17} color={canSend ? "#fff" : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Empty state
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  emptyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: font.title, fontFamily: type.uiBold, textAlign: "center" },
  emptySub: { fontSize: font.body, fontFamily: type.ui, textAlign: "center", lineHeight: 22 },
  chips: { width: "100%", gap: spacing.sm },
  sectionLabel: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },

  // Message list
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  // Bubbles
  bubbleWrap: { gap: 4 },
  bubbleWrapUser: { alignItems: "flex-end" },
  bubbleWrapAssistant: { alignItems: "flex-start" },
  userBubble: {
    maxWidth: "82%",
    borderRadius: radius.xl,
    borderBottomRightRadius: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  userText: { fontSize: font.body, fontFamily: type.ui, lineHeight: 22 },
  assistantBubble: {
    maxWidth: "82%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
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
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  assistantText: { fontSize: font.body, fontFamily: type.ui, lineHeight: 22, flex: 1 },
  offlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  offlineText: { fontSize: font.label, fontFamily: type.uiMedium },

  // Typing dots
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 2, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6 },

  // Error banner
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorMsg: { flex: 1, fontSize: font.label, fontFamily: type.uiMedium, lineHeight: 18 },
  retryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    minHeight: 32,
    justifyContent: "center",
  },
  retryText: { fontSize: font.label, fontFamily: type.uiSemi },

  // Input bar
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.body,
    fontFamily: type.ui,
    maxHeight: 120,
    minHeight: hit.min,
    borderWidth: 1,
  },
  sendBtn: {
    width: hit.min,
    height: hit.min,
    borderRadius: hit.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
