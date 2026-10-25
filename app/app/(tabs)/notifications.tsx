import React, {
  useCallback,
  useRef,
  useState,
} from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  useReducedMotion,
} from "react-native-reanimated";
import { api, type Notification } from "../../api";
import { useTheme } from "../../ThemeContext";
import { font, type, spacing, radius, shadow, hit } from "../../theme";
import AlertCard from "../../components/AlertCard";
import Toast, { type ToastHandle } from "../../components/ui/Toast";
import Skeleton from "../../components/Skeleton";
import {
  registerCategories,
  scheduleDemoNotifications,
} from "../../notificationService";

// ── Kind → accent color ────────────────────────────────────────────────────────

function useAccentForKind(kind: Notification["kind"]) {
  const { colors } = useTheme();
  if (kind === "credit" || kind === "signup_bonus") return colors.good;
  return colors.warn;
}

// ── Web banner ────────────────────────────────────────────────────────────────

function WebBanner({
  note,
  onApprove,
  onDismiss,
  onExited,
}: {
  note: Notification;
  onApprove: () => void;
  onDismiss: () => void;
  onExited: () => void;
}) {
  const { colors } = useTheme();
  const accent = useAccentForKind(note.kind);
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primaryLabel = note.actions[0] ?? "Got it";
  const secondaryLabel = note.actions[1];

  const dismiss = useCallback(
    (cb?: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      setVisible(false);
      setTimeout(() => { onExited(); cb?.(); }, 280);
    },
    [onExited]
  );

  React.useEffect(() => {
    timer.current = setTimeout(() => dismiss(), 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      exiting={FadeOutDown.duration(260)}
      style={[styles.webBanner, { backgroundColor: colors.surface, borderLeftColor: accent }]}
    >
      <View style={styles.bannerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: colors.text }]} numberOfLines={1}>
            {note.title}
          </Text>
          <Text style={[styles.bannerBody, { color: colors.muted }]} numberOfLines={3}>
            {note.body}
          </Text>
        </View>
        <Pressable
          onPress={() => dismiss()}
          accessibilityLabel="Close"
          hitSlop={12}
          style={styles.bannerClose}
        >
          <Ionicons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.bannerActions}>
        <Pressable
          onPress={() => dismiss(onApprove)}
          accessibilityLabel={primaryLabel}
          style={[styles.bannerBtn, { backgroundColor: accent + "18", borderColor: accent + "44" }]}
        >
          <Text style={[styles.bannerBtnText, { color: accent }]}>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel && (
          <Pressable
            onPress={() => dismiss(onDismiss)}
            accessibilityLabel={secondaryLabel}
            style={[styles.bannerBtn, { backgroundColor: colors.surfaceSubtle, borderColor: "transparent" }]}
          >
            <Text style={[styles.bannerBtnText, { color: colors.muted }]}>{secondaryLabel}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      {[88, 104, 96].map((h, i) => (
        <Skeleton key={i} height={h} borderRadius={radius.xl} />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const [notes, setNotes] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const toastRef = useRef<ToastHandle>(null);

  // Web banner queue
  const [bannerCurrent, setBannerCurrent] = useState<Notification | null>(null);
  const [bannerQueue, setBannerQueue] = useState<Notification[]>([]);

  // ── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const list = await api.notifications();
      setNotes(list);
    } catch {
      //
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handlePrimary = useCallback(async (note: Notification) => {
    try {
      await api.approve(note.id);
      removeNote(note.id);
      toastRef.current?.show(`${note.actions[0] ?? "Done"}!`, "good");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Action failed");
    }
  }, [removeNote]);

  const handleSecondary = useCallback(async (note: Notification) => {
    try {
      await api.dismiss(note.id);
      removeNote(note.id);
    } catch {
      //
    }
  }, [removeNote]);

  // ── Demo notifications ────────────────────────────────────────────────────

  const handleSendDemo = useCallback(async () => {
    if (scheduling) return;
    setScheduling(true);
    try {
      const freshNotes = await api.notifications();
      if (Platform.OS === "web") {
        setBannerQueue(freshNotes.slice(1));
        setBannerCurrent(freshNotes[0] ?? null);
      } else {
        await registerCategories(freshNotes);
        await scheduleDemoNotifications(freshNotes);
        Alert.alert(
          "Notifications scheduled",
          `${freshNotes.length} alert${freshNotes.length !== 1 ? "s" : ""} will arrive shortly.`
        );
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to schedule notifications");
    } finally {
      setScheduling(false);
    }
  }, [scheduling]);

  // ── Web banner callbacks ─────────────────────────────────────────────────

  const advanceBanner = useCallback(() => {
    setBannerQueue((prev) => {
      const [, ...rest] = prev;
      setBannerCurrent(rest[0] ?? null);
      return rest;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <Toast ref={toastRef} />

      {/* Web sliding banner */}
      {Platform.OS === "web" && bannerCurrent && (
        <WebBanner
          key={bannerCurrent.id}
          note={bannerCurrent}
          onApprove={async () => { await handlePrimary(bannerCurrent); }}
          onDismiss={async () => { await handleSecondary(bannerCurrent); }}
          onExited={advanceBanner}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.good}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Demo button */}
        <Pressable
          onPress={handleSendDemo}
          disabled={scheduling}
          accessibilityLabel={
            Platform.OS === "web" ? "Show demo notifications" : "Send demo notifications"
          }
          style={({ pressed }) => [
            styles.demoBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: scheduling ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="notifications-outline" size={16} color={colors.text} />
          <Text style={[styles.demoBtnText, { color: colors.text }]}>
            {Platform.OS === "web" ? "Show demo notifications" : "Send demo notifications"}
          </Text>
        </Pressable>

        {/* Initial load */}
        {initialLoad && <ListSkeleton />}

        {/* Empty state */}
        {!initialLoad && notes.length === 0 && (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.goodFill }]}>
              <Ionicons name="checkmark-circle" size={32} color={colors.good} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              No alerts right now. Pull to refresh.
            </Text>
          </View>
        )}

        {/* Alert list */}
        {!initialLoad && (
          <Animated.View
            layout={reduceMotion || Platform.OS === "web" ? undefined : LinearTransition.springify().damping(18).stiffness(170)}
            style={styles.list}
          >
            {notes.map((note, i) => (
              <Animated.View
                key={note.id}
                entering={reduceMotion ? undefined : FadeInDown.delay(i * 60).duration(260).springify()}
                exiting={reduceMotion ? undefined : FadeOutDown.duration(220)}
                layout={reduceMotion || Platform.OS === "web" ? undefined : LinearTransition.springify().damping(18).stiffness(170)}
              >
                <AlertCard
                  notification={note}
                  onPrimary={handlePrimary}
                  onSecondary={handleSecondary}
                />
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },

  // Demo button
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    minHeight: hit.min,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    ...shadow.soft,
  },
  demoBtnText: { fontSize: font.body, fontFamily: type.uiSemi },

  // List
  list: { gap: spacing.md },

  // Empty
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.md },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: font.title, fontFamily: type.uiBold },
  emptySub: { fontSize: font.label, fontFamily: type.ui, textAlign: "center" },

  // Web banner
  webBanner: {
    position: "absolute",
    top: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 100,
    borderRadius: radius.xl,
    borderLeftWidth: 3,
    padding: spacing.lg,
    ...shadow.stack,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerTitle: { fontSize: font.body, fontFamily: type.uiSemi, marginBottom: 3 },
  bannerBody: { fontSize: font.label, fontFamily: type.ui, lineHeight: 18 },
  bannerClose: {
    width: hit.min,
    height: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerActions: { flexDirection: "row", gap: spacing.sm },
  bannerBtn: {
    flex: 1,
    minHeight: hit.min,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  bannerBtnText: { fontSize: font.body, fontFamily: type.uiSemi },
});
