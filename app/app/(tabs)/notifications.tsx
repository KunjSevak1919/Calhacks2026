import React, {
  useCallback,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
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
import { api, Notification } from "../../api";
import NotificationCard from "../../components/NotificationCard";
import Toast, { ToastHandle } from "../../components/ui/Toast";
import PressScale from "../../components/PressScale";
import Skeleton from "../../components/Skeleton";
import { lightTap } from "../../haptics";
import { colors, spacing, radius, font, type, shadow, hit } from "../../theme";
import {
  registerCategories,
  scheduleDemoNotifications,
} from "../../notificationService";

// ── Web-only sliding banner (Reanimated) ──────────────────────────────────

interface BannerProps {
  note: Notification;
  onApprove: () => void;
  onDismiss: () => void;
  onExited: () => void;
}

function accentForNote(note: Notification): string {
  if (note.kind === "credit") return colors.coach;
  if (note.kind === "signup_bonus") return colors.good;
  return colors.warn;
}

function WebBanner({ note, onApprove, onDismiss, onExited }: BannerProps) {
  // Use a key-based re-mount per note so entering fires fresh each time.
  // Slide out is driven by removing the element (FadeOutDown exiting prop).
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accent = accentForNote(note);
  const primaryLabel = note.actions[0] ?? "Got it";
  const secondaryLabel = note.actions[1];

  const dismiss = useCallback(
    (cb?: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      // onExited fires after exit anim (~260 ms) via a timeout
      setTimeout(() => {
        onExited();
        cb?.();
      }, 280);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id]
  );

  // Auto-dismiss after 6 s
  React.useEffect(() => {
    timerRef.current = setTimeout(() => dismiss(), 6000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      exiting={FadeOutDown.duration(260)}
      style={[styles.webBanner, { borderLeftColor: accent }]}
    >
      <View style={styles.bannerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle} numberOfLines={1}>{note.title}</Text>
          <Text style={styles.bannerBody} numberOfLines={3}>{note.body}</Text>
        </View>
        <PressScale
          onPress={() => dismiss()}
          accessibilityLabel="Close"
          style={styles.bannerClose}
        >
          <Ionicons name="close" size={16} color={colors.muted} />
        </PressScale>
      </View>
      <View style={styles.bannerActions}>
        <PressScale
          onPress={() => dismiss(onApprove)}
          accessibilityLabel={primaryLabel}
          style={[styles.bannerBtn, { backgroundColor: accent + "18", borderColor: accent + "44" }]}
        >
          <Text style={[styles.bannerBtnText, { color: accent }]}>{primaryLabel}</Text>
        </PressScale>
        {secondaryLabel && (
          <PressScale
            onPress={() => dismiss(onDismiss)}
            accessibilityLabel={secondaryLabel}
            style={[styles.bannerBtn, styles.bannerBtnSecondary]}
          >
            <Text style={[styles.bannerBtnText, { color: colors.muted }]}>{secondaryLabel}</Text>
          </PressScale>
        )}
      </View>
    </Animated.View>
  );
}

// ── Skeleton placeholder ──────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      {[88, 104, 96].map((h, i) => (
        <Skeleton key={i} height={h} r={radius.xl} />
      ))}
    </View>
  );
}

// ── Notifications screen ──────────────────────────────────────────────────

export default function NotificationsScreen() {
  const reduce = useReducedMotion();
  const [notes, setNotes] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const toastRef = useRef<ToastHandle>(null);

  // Web banner queue
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
            lightTap();
            removeNote(note.id);
            toastRef.current?.show("Done!", "good");
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Action failed");
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

  // ── Demo notifications ─────────────────────────────────────────────────

  const handleSendDemo = async () => {
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
          `${freshNotes.length} alert${freshNotes.length !== 1 ? "s" : ""} will arrive ${freshNotes.length > 1 ? "3 seconds apart" : "in 3 seconds"}.`
        );
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to schedule notifications");
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
      {/* Toast — absolute, on top of everything */}
      <Toast ref={toastRef} />

      {/* Web sliding banner */}
      {Platform.OS === "web" && bannerCurrent && (
        <WebBanner
          key={bannerCurrent.id}
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
            tintColor={colors.good}
          />
        }
      >
        {/* Header */}
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          Proactive nudges before they cost you money.
        </Text>

        {/* Demo button */}
        <PressScale
          onPress={handleSendDemo}
          disabled={scheduling}
          style={[styles.demoBtn, scheduling && styles.demoBtnDisabled]}
          accessibilityLabel={
            Platform.OS === "web" ? "Show demo notifications" : "Send demo notifications"
          }
        >
          <Ionicons
            name="notifications-outline"
            size={16}
            color={colors.text}
          />
          <Text style={styles.demoBtnText}>
            {Platform.OS === "web" ? "Show demo notifications" : "Send demo notifications"}
          </Text>
        </PressScale>

        {/* Initial load skeleton */}
        {initialLoad && <ListSkeleton />}

        {/* Empty state */}
        {!initialLoad && notes.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-circle" size={32} color={colors.good} />
            </View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySub}>No alerts right now. Pull to refresh.</Text>
          </View>
        )}

        {/* Note list — LinearTransition skipped on web (causes nested-Animated warning) */}
        {!initialLoad && (
          <Animated.View
            layout={reduce || Platform.OS === "web" ? undefined : LinearTransition.springify().damping(18).stiffness(170)}
            style={styles.list}
          >
            {notes.map((note, i) => (
              <Animated.View
                key={note.id}
                entering={reduce ? undefined : FadeInDown.delay(i * 60).duration(260).springify()}
                exiting={reduce ? undefined : FadeOutDown.duration(220)}
                layout={reduce || Platform.OS === "web" ? undefined : LinearTransition.springify().damping(18).stiffness(170)}
              >
                <NotificationCard
                  note={note}
                  loading={actionLoading[note.id]}
                  onApprove={() => handleApprove(note)}
                  onDismiss={() => handleDismiss(note.id)}
                />
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },

  title: {
    color: colors.text,
    fontSize: font.screen,
    fontFamily: type.uiBold,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  // Demo button
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    minHeight: hit.min,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  demoBtnDisabled: { opacity: 0.5 },
  demoBtnText: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },

  // Note list
  list: { gap: spacing.md },

  // Empty state
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.goodFill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontFamily: type.uiBold,
  },
  emptySub: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    textAlign: "center",
  },

  // Web sliding banner
  webBanner: {
    position: "absolute",
    top: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderLeftWidth: 3,
    padding: spacing.lg,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.uiSemi,
    marginBottom: 3,
  },
  bannerBody: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    lineHeight: 18,
  },
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
  bannerBtnSecondary: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: "transparent",
  },
  bannerBtnText: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
});
