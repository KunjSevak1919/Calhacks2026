import { Platform } from "react-native";

// Your Mac's address for the phone. Find it with: ipconfig getifaddr en0
// Venue Wi-Fi: 10.0.22.193   |   iPhone hotspot: usually 172.20.10.2 (never .1)
const LAPTOP_IP = "172.20.10.7";
const RENDER_URL = "https://pocketpilot-bkul.onrender.com";
const USE_LOCAL = false; // true = use the Flask server on this Mac

export const SERVER_URL = USE_LOCAL
  ? (Platform.OS === "web" ? "http://localhost:5001" : `http://${LAPTOP_IP}:5001`)
  : RENDER_URL;