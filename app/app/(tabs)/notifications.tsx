import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, Notification } from "../../api";
import NotificationCard from "../../components/NotificationCard";
import { colors, spacing, font } from "../../theme";

export default function NotificationsScreen() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [initialLoad, setInitialLoad] = useState(true);

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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const setNoteLoading = (id: string, val: boolean) =>
    setLoading((prev) => ({ ...prev, [id]: val }));

  const handleApprove = (note: Notification) => {
    // Use the action label from the server (actions[0]) for the confirm button.
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
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
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
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      //
    } finally {
      setNoteLoading(id, false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          Proactive nudges before they cost you money.
        </Text>

        {initialLoad && (
          <ActivityIndicator color={colors.mint} style={{ marginTop: spacing.xl }} />
        )}

        {!initialLoad && notes.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={48} color={colors.mint} />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptySub}>No alerts right now. Pull to refresh.</Text>
          </View>
        )}

        {notes.map((note) => (
          <NotificationCard
            key={note.id}
            note={note}
            loading={loading[note.id]}
            onApprove={() => handleApprove(note)}
            onDismiss={() => handleDismiss(note.id)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: "800", marginBottom: spacing.xs },
  subtitle: { color: colors.muted, fontSize: font.sm, marginBottom: spacing.lg, lineHeight: 20 },
  empty: {
    alignItems: "center",
    paddingTop: spacing.xl * 2,
    gap: spacing.md,
  },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  emptySub: { color: colors.muted, fontSize: font.sm },
});
