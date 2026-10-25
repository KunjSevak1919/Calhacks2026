import { Platform } from "react-native";

// Your Mac's address for the phone. Find it with: ipconfig getifaddr en0
// Venue Wi-Fi: 10.0.22.193   |   iPhone hotspot: usually 172.20.10.2 (never .1)
const LAPTOP_IP = "10.0.22.193";

// The browser runs on the same Mac, so it can always use localhost.
export const SERVER_URL =
  Platform.OS === "web" ? "http://localhost:5001" : `http://${LAPTOP_IP}:5001`;
