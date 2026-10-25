/**
 * Display-only funding badge. The server decides funding via POST /api/vfc/authorize;
 * this chip only shows the result — it is not interactive.
 */
import React, { memo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";

export type FundingType = "credit" | "debit" | "installments";

export type FundingChipProps = {
  funding: FundingType;
};

const LABELS: Record<FundingType, string> = {
  credit: "Credit",
  debit: "Debit",
  installments: "Installments",
};

function FundingChip({ funding }: FundingChipProps) {
  const { colors } = useTheme();

  const bg =
    funding === "credit"
      ? colors.goodFill
      : funding === "debit"
      ? colors.coachFill
      : colors.warnFill;

  const fg =
    funding === "credit"
      ? colors.good
      : funding === "debit"
      ? colors.coach
      : colors.warn;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Funding: ${LABELS[funding]}`}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: fg, fontSize: font.label, fontFamily: type.uiSemi }}>
        {LABELS[funding]}
      </Text>
    </View>
  );
}

export default memo(FundingChip);
