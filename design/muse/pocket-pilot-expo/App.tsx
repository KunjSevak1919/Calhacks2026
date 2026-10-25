/**
 * Pocket Pilot app shell (demo wiring only).
 * Screens are prop-driven; this file supplies the design data from data.ts
 * and holds the tab / Debt Guard / funding / alerts / chat state.
 * Replace the demo handlers here with your navigation and API layer.
 */

import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme, type ThemeMode } from './theme';
import type { AlertItem, ChatMessage, FundingOption } from './types';
import WalletScreen from './screens/Wallet';
import PayScreen from './screens/Pay';
import OneCardScreen from './screens/OneCard';
import AlertsScreen from './screens/Alerts';
import CoachScreen from './screens/Coach';
import {
  cards,
  coachAnswers,
  coachSuggestions,
  initialAlerts,
  initialCoachMessages,
  installments,
  moneyKept,
  oneCardRules,
  payback,
  rankedByLowestCost,
  rankedByRewards,
  stores,
  totals,
} from './data';

type Tab = 'wallet' | 'pay' | 'onecard' | 'alerts' | 'coach';

const TABS: { id: Tab; label: string }[] = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'pay', label: 'Pay' },
  { id: 'onecard', label: 'One Card' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'coach', label: 'Coach' },
];

const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

function InnerApp() {
  const { theme, mode, setMode } = useTheme();
  const [tab, setTab] = useState<Tab>('wallet');
  const [debtGuard, setDebtGuard] = useState(true);
  const [store, setStore] = useState('Whole Foods');
  const [searchQuery, setSearchQuery] = useState('');
  const [amount, setAmount] = useState('84.50');
  const [funding, setFunding] = useState<FundingOption>('debit');
  const [alerts, setAlerts] = useState<AlertItem[]>(initialAlerts);
  const [confirmation, setConfirmation] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>(initialCoachMessages);

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.background,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.body,
    },
    themeButton: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    themeButtonText: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    content: { flex: 1 },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.tabBarBackground,
      borderTopWidth: 1,
      borderTopColor: theme.colors.tabBarBorder,
      paddingBottom: theme.spacing.sm,
    },
    tab: {
      flex: 1,
      minHeight: 56,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tabText: {
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.caption,
    },
  });

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(mode) + 1) % THEME_CYCLE.length];
    setMode(next);
  };

  const ranked = debtGuard ? rankedByLowestCost : rankedByRewards;
  const winningCard = debtGuard ? cards[2] : cards[0];
  const recommendation = debtGuard
    ? {
        winningCardId: 'zero' as const,
        headline: 'Use Zero Intro instead.',
        detail:
          'Aurum Gold would earn $3.38, but its 29.9% APR would cost $6.32 over 3 months.',
        storeTypeNote:
          store === 'Target'
            ? 'Target counts as a discount store, not grocery.'
            : `${store} counts as grocery for this example.`,
      }
    : {
        winningCardId: 'aurum' as const,
        headline: 'Aurum Gold: 4% on grocery, $3.38 back',
        detail: 'Best rewards for this purchase.',
        storeTypeNote:
          store === 'Target'
            ? 'Target counts as a discount store, not grocery.'
            : `${store} counts as grocery for this example.`,
      };

  const handleSuggestion = (suggestion: string) => {
    const answer = coachAnswers[suggestion] ?? 'Good question — I’ll keep the answer in plain words.';
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: suggestion },
      { id: `coach-${Date.now()}`, role: 'coach', text: answer },
    ]);
  };

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text },
      {
        id: `coach-${Date.now()}`,
        role: 'coach',
        text: 'Thanks — I’ll keep this in plain words. For a specific card, check the payback comparison above. (Live Coach answers come from your backend in production.)',
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Pocket Pilot</Text>
        <Pressable
          onPress={cycleTheme}
          accessibilityRole="button"
          accessibilityLabel={`Theme mode: ${mode}. Tap to change theme.`}
          style={styles.themeButton}
        >
          <Text style={styles.themeButtonText}>
            {mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === 'wallet' && (
          <WalletScreen
            greeting="Good afternoon, Kirtan"
            cards={cards}
            totals={totals}
            moneyKept={moneyKept}
            debtGuard={debtGuard}
            onDebtGuardChange={setDebtGuard}
            nextDue={{ cardName: 'Aurum Gold', date: 'Oct 30' }}
          />
        )}
        {tab === 'pay' && (
          <PayScreen
            stores={stores}
            selectedStore={store}
            onStoreChange={setStore}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            amount={amount}
            onAmountChange={setAmount}
            debtGuard={debtGuard}
            onDebtGuardChange={setDebtGuard}
            recommendation={recommendation}
            ranked={ranked}
            winningCard={winningCard}
          />
        )}
        {tab === 'onecard' && (
          <OneCardScreen
            cardName="Visa Flexible"
            funding={funding}
            onFundingChange={setFunding}
            rule={oneCardRules[funding]}
            checkingBalance={380}
            safetyBuffer={100}
            availableAfterBuffer={280}
            installments={installments}
            purchaseAmount={600}
            simulated
            merchantCategoryKept
          />
        )}
        {tab === 'alerts' && (
          <AlertsScreen
            alerts={alerts}
            confirmationMessage={confirmation}
            onAlertPrimary={(alert) => {
              if (alert.kind === 'due' && alert.doneMessage) {
                setConfirmation(alert.doneMessage);
              }
              if (alert.kind === 'fee') {
                setConfirmation('Voyager options are not wired up yet in this demo.');
              }
              setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
            }}
            onAlertSecondary={() => {
              // Later / Keep it: leave the alert in place.
            }}
          />
        )}
        {tab === 'coach' && (
          <CoachScreen
            messages={messages}
            suggestions={coachSuggestions}
            onSuggestion={handleSuggestion}
            onSend={handleSend}
            payback={payback}
          />
        )}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? theme.colors.accent : theme.colors.tabInactive },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <InnerApp />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
