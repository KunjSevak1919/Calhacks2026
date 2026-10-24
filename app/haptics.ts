import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Light tap. No-op on web; phone only. */
export function lightTap() {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
