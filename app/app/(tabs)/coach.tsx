import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api";
import { colors, spacing, radius, font } from "../../theme";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "When should I pay my balance?",
  "Which card is best for groceries?",
  "What's the 15/3 payment trick?",
  "How does APR affect me?",
];

let msgId = 0;
const nextId = () => String(++msgId);

export default function CoachScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const history = messages.map((m) => ({ role: m.role, content: m.content }));

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");

    const userMsg: Message = { id: nextId(), role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await api.coach(q, history);
      const assistantMsg: Message = {
        id: nextId(),
        role: "assistant",
        content: res.answer,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: unknown) {
      const errMsg: Message = {
        id: nextId(),
        role: "assistant",
        content: e instanceof Error ? e.message : "Couldn't reach the server.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {!isUser && (
          <View style={styles.coachIcon}>
            <Ionicons name="sparkles" size={12} color={colors.blue} />
          </View>
        )}
        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={18} color={colors.blue} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Ask Coach</Text>
            <Text style={styles.headerSub}>Powered by Claude</Text>
          </View>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-ellipses" size={32} color={colors.blue} />
            </View>
            <Text style={styles.emptyTitle}>I'm your credit coach</Text>
            <Text style={styles.emptySub}>
              Ask me anything about your cards, interest, or how to optimize your spending.
            </Text>
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.starterBtn}
                  onPress={() => send(s)}
                  disabled={loading}
                >
                  <Text style={styles.starterText}>{s}</Text>
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <View style={styles.coachIcon}>
              <Ionicons name="sparkles" size={12} color={colors.blue} />
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={colors.blue} />
            </View>
          </View>
        )}

        {/* Input */}
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
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendDisabled]}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

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
  emptySub: { color: colors.muted, fontSize: font.sm, textAlign: "center", lineHeight: 20 },
  starters: { width: "100%", gap: spacing.sm },
  starterBtn: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.blue + "33",
  },
  starterText: { color: colors.blue, fontSize: font.sm },

  messageList: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.sm },

  bubble: {
    maxWidth: "85%",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  coachIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue + "22",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  bubbleText: { fontSize: font.sm, lineHeight: 20, flex: 1 },
  userText: { color: colors.bg },
  assistantText: { color: colors.text },

  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  typingBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },

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
