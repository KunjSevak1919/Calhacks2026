import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api, Notification } from "../../api";
import NotificationCard from "../../components/NotificationCard";
import { colors, spacing, radius, font } from "../../theme";
import {
  registerCategories,
  scheduleDemoNotifications,
} from "../../notificationService";

// ── Web-only sliding banner ───────────────────────────────────────────────

interface BannerProps {
  note: Notification;
  onApprove: () => void;
  onDismiss: () => void;
  /** Called after the exit animation finishes so the queue advances. */
  onExited: () => void;
}

function WebBanner({ note, onApprove, onDismiss, onExited }: BannerProps) {
  const slideAnim = useRef(new Animated.Value(-140)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideOut = useCallback(
    (cb?: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      Animated.timing(slideAnim, {
        toValue: -140,
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        onExited();
        cb?.();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id]
  );

  useEffect(() => {
    // Slide in fresh for each new note.
    slideAnim.setValue(-140);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 9,
    }).start();
    // Auto-dismiss after 6 s.
    timerRef.current = setTimeout(() => slideOut(), 6000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const handleApprove = () => slideOut(onApprove);
  const handleDismiss = () => slideOut(onDismiss);

  // Derive accent from kind (same logic as NotificationCard)
  const accent =
    note.kind === "credit" || note.kind === "signup_bonus"
      ? note.kind === "credit"
        ? colors.blue
        : colors.mint
      : colors.amber;

  const primaryLabel = note.actions[0] ?? "Got it";
  const secondaryLabel = note.actions[1];

  return (
    <Animated.View
      style={[
        styles.webBanner,
        { borderLeftColor: accent, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.bannerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {note.title}
          </Text>
          <Text style={styles.bannerBody} numberOfLines={3}>
            {note.body}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bannerClose}
          onPress={() => slideOut()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <View style={styles.bannerActions}>
        <TouchableOpacity
          style={[styles.bannerBtn, { backgroundColor: accent + "22", borderColor: accent + "55" }]}
          onPress={handleApprove}
        >
          <Text style={[styles.bannerBtnText, { color: accent }]}>
            {primaryLabel}
          </Text>
        </TouchableOpacity>
        {secondaryLabel && (
          <TouchableOpacity
            style={[styles.bannerBtn, styles.bannerBtnDismiss]}
            onPress={handleDismiss}
          >
            <Text style={[styles.bannerBtnText, { color: colors.muted }]}>
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ── Notifications screen ──────────────────────────────────────────────────

export default function NotificationsScreen() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [scheduling, setScheduling] = useState(false);

  // Web banner queue (web-only; on native the OS delivers real notifications)
  const [bannerQueue, setBannerQueue] = useState<Notification[]>([]);
  const [bannerCurrent, setBannerCurrent] = useState<Notification | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────

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

  // Refresh every time this tab comes into focus — catches actions taken
  // via notification banners (native or web).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Action helpers ─────────────────────────────────────────────────────

  const setNoteLoading = (id: string, val: boolean) =>
    setActionLoading((prev) => ({ ...prev, [id]: val }));

  const removeNote = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const handleApprove = (note: Notification) => {
    const actionLabel = note.actions[0] ?? "Confirm";
    Alert.alert(note.title, note.body, [
      { text: "Cancel", style: "cancel" },
      {
        text: actionLabel,
        style: "destructive",
        onPress: async () => {
          setNoteLoading(note.id, true);
          try {
            await api.approve(note.id);
            removeNote(note.id);
          } catch (e: unknown) {
            Alert.alert(
              "Error",
              e instanceof Error ? e.message : "Action failed"
            );
          } finally {
            setNoteLoading(note.id, false);
          }
        },
      },
    ]);
  };

  const handleDismiss = async (id: string) => {
    setNoteLoading(id, true);
    try {
      await api.dismiss(id);
      removeNote(id);
    } catch {
      //
    } finally {
      setNoteLoading(id, false);
    }
  };

  // ── "Send demo notifications" ──────────────────────────────────────────

  const handleSendDemo = async () => {
    if (scheduling) return;
    setScheduling(true);
    try {
      // Always fetch fresh so we only schedule un-dismissed notifications.
      const freshNotes = await api.notifications();

      if (Platform.OS === "web") {
        // Web: feed the banner queue instead of OS notifications.
        setBannerQueue(freshNotes.slice(1));
        setBannerCurrent(freshNotes[0] ?? null);
      } else {
        // Native: register categories then schedule real local notifications.
        await registerCategories(freshNotes);
        await scheduleDemoNotifications(freshNotes);
        Alert.alert(
          "Notifications scheduled",
          `${freshNotes.length} alert${freshNotes.length !== 1 ? "s" : ""} will arrive ${freshNotes.length > 1 ? "3 seconds apart" : "in 3 seconds"}.`
        );
      }
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to schedule notifications"
      );
    } finally {
      setScheduling(false);
    }
  };

  // ── Web banner callbacks ───────────────────────────────────────────────

  const advanceBanner = useCallback(() => {
    setBannerQueue((prev) => {
      const [, ...rest] = prev;
      setBannerCurrent(rest[0] ?? null);
      return rest;
    });
  }, []);

  const handleBannerApprove = useCallback(async (note: Notification) => {
    try {
      await api.approve(note.id);
      removeNote(note.id);
    } catch {
      //
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBannerDismiss = useCallback(async (note: Notification) => {
    try {
      await api.dismiss(note.id);
      removeNote(note.id);
    } catch {
      //
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Web sliding banner — rendered above the scroll view */}
      {Platform.OS === "web" && bannerCurrent && (
        <WebBanner
          note={bannerCurrent}
          onApprove={() => handleBannerApprove(bannerCurrent)}
          onDismiss={() => handleBannerDismiss(bannerCurrent)}
          onExited={advanceBanner}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mint}
          />
        }
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Alerts</Text>
            <Text style={styles.subtitle}>
              Proactive nudges before they cost you money.
            </Text>
          </View>
        </View>

        {/* "Send demo notifications" button */}
        <TouchableOpacity
          style={[styles.demoBtn, scheduling && styles.demoBtnDisabled]}
          onPress={handleSendDemo}
          disabled={scheduling}
        >
          {scheduling ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Ionicons name="notifications-outline" size={16} color={colors.bg} />
          )}
          <Text style={styles.demoBtnText}>
            {Platform.OS === "web"
              ? "Show demo notifications"
              : "Send demo notifications"}
          </Text>
        </TouchableOpacity>

        {initialLoad && (
          <ActivityIndicator
            color={colors.mint}
            style={{ marginTop: spacing.xl }}
          />
        )}

        {!initialLoad && notes.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={48} color={colors.mint} />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptySub}>
              No alerts right now. Pull to refresh.
            </Text>
          </View>
        )}

        {notes.map((note) => (
          <NotificationCard
            key={note.id}
            note={note}
            loading={actionLoading[note.id]}
            onApprove={() => handleApprove(note)}
            onDismiss={() => handleDismiss(note.id)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: { color: colors.muted, fontSize: font.sm, lineHeight: 20 },

  // Demo button
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    justifyContent: "center",
  },
  demoBtnDisabled: { opacity: 0.6 },
  demoBtnText: {
    color: colors.bg,
    fontSize: font.sm,
    fontWeight: "700",
  },

  // Empty state
  empty: {
    alignItems: "center",
    paddingTop: spacing.xl * 2,
    gap: spacing.md,
  },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  emptySub: { color: colors.muted, fontSize: font.sm },

  // Web sliding banner
  webBanner: {
    position: "absolute",
    top: 0,
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: spacing.md,
    // Shadow (iOS + web)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: "700",
    marginBottom: 3,
  },
  bannerBody: {
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 18,
  },
  bannerClose: {
    padding: spacing.xs,
  },
  bannerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bannerBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    borderWidth: 1,
  },
  bannerBtnDismiss: {
    backgroundColor: colors.border,
    borderColor: "transparent",
  },
  bannerBtnText: {
    fontSize: font.sm,
    fontWeight: "600",
  },
});
