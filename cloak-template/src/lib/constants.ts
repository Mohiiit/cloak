export const RECIPIENT_TONGO_ADDRESS =
  "biHzaYuUksyfVvVzXawtNyxW2BXfzjtc6zMPn5LdJmzU";

export const COFFEE_TIERS = [
  { id: 1, label: "1 Coffee", units: "1", strk: "0.05", emoji: "\u2615" },
  { id: 3, label: "3 Coffees", units: "3", strk: "0.15", emoji: "\uD83D\uDD25" },
  { id: 5, label: "5 Coffees", units: "5", strk: "0.25", emoji: "\uD83D\uDE80" },
] as const;

export const STRK_DECIMALS = 18;
export const STRK_PER_UNIT = 0.05;

export const EXPLORER_BASE = "https://sepolia.voyager.online/tx/";
export const GITHUB_URL = "https://github.com/mohiiit/cloak";
