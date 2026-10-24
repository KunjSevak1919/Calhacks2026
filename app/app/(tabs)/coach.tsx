import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api";
import { colors, spacing, radius, font } from "../../theme";

// ── Types ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: string;     // "claude" | "offline" | "offline (ErrorName)"
  isTyping?: boolean;  // true only for the placeholder while the server responds
}

// ── Typing indicator (three animated dots) ────────────────────────────────

function TypingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(dot, {
            toValue: -5,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.delay(500),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
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

// ── ID counter ────────────────────────────────────────────────────────────

let msgId = 0;
const nextId = () => String(++msgId);
const TYPING_ID = "__typing__";

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
    setInput("");

    // Snapshot history BEFORE adding the new user message
    const history = messages
      .filter((m) => !m.isTyping)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: Message = { id: nextId(), role: "user", content: q };
    const typingMsg: Message = {
      id: TYPING_ID,
      role: "assistant",
      content: "",
      isTyping: true,
    };

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
      // Replace the typing placeholder with the real response
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

  const renderItem = ({ item }: { item: Message }) => {
    if (item.isTyping) {
      return (
        <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
          <View style={styles.coachIcon}>
            <Ionicons name="sparkles" size={12} color={colors.blue} />
          </View>
          <TypingDots />
        </View>
      );
    }

    const isUser = item.role === "user";
    const isOffline =
      typeof item.source === "string" && item.source.startsWith("offline");

    return (
      <View
        style={[
          styles.messageWrap,
          isUser ? styles.messageWrapUser : styles.messageWrapAssistant,
        ]}
      >
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {!isUser && (
            <View style={styles.coachIcon}>
              <Ionicons name="sparkles" size={12} color={colors.blue} />
            </View>
          )}
          <Text
            style={[
              styles.bubbleText,
              isUser ? styles.userText : styles.assistantText,
            ]}
          >
            {item.content}
          </Text>
        </View>

        {/* Offline warning — shown under the bubble if the server wasn't live */}
        {isOffline && (
          <View style={styles.offlineChip}>
            <Ionicons name="warning-outline" size={12} color={colors.amber} />
            <Text style={styles.offlineText}>
              Offline · {item.source}
            </Text>
          </View>
        )}
      </View>
    );
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
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={18} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ask Coach</Text>
            <Text style={styles.headerSub}>Powered by Claude</Text>
          </View>
          <Text style={styles.disclaimer}>Not financial advice.</Text>
        </View>

        {/* Empty state — suggestion chips */}
        {!hasMessages ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-ellipses" size={32} color={colors.blue} />
            </View>
            <Text style={styles.emptyTitle}>I'm your credit coach</Text>
            <Text style={styles.emptySub}>
              Ask me anything about your cards, interest, or how to optimize your spending.
            </Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.chip}
                  onPress={() => send(s)}
                  disabled={loading}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
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
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendDisabled,
            ]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="arrow-up" size={18} color={colors.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blue + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontSize: font.lg, fontWeight: "700" },
  headerSub: { color: colors.muted, fontSize: font.xs },
  disclaimer: {
    color: colors.muted,
    fontSize: font.xs,
    fontStyle: "italic",
    flexShrink: 1,
    textAlign: "right",
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.blue + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  emptySub: {
    color: colors.muted,
    fontSize: font.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  chips: { width: "100%", gap: spacing.sm },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.blue + "33",
  },
  chipText: { color: colors.blue, fontSize: font.sm },

  // Message list
  messageList: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  messageWrap: { gap: 4 },
  messageWrapUser: { alignItems: "flex-end" },
  messageWrapAssistant: { alignItems: "flex-start" },

  // Bubbles
  bubble: {
    maxWidth: "85%",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.blue,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  typingBubble: {
    paddingVertical: spacing.sm + 2,
  },
  coachIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue + "22",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  bubbleText: { fontSize: font.sm, lineHeight: 20, flex: 1 },
  userText: { color: colors.bg },
  assistantText: { color: colors.text },

  // Offline chip
  offlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  offlineText: {
    color: colors.amber,
    fontSize: font.xs,
  },

  // Typing dots
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.blue,
    opacity: 0.7,
  },

  // Input row
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: font.md,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: colors.border },
});
