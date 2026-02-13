import { GITHUB_URL } from "@/lib/constants";
import { ExternalLink } from "lucide-react";

export default function CloakBadge() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[11px] text-cloak-muted hover:text-cloak-text-dim transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 6v6l4 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      Private payment powered by Cloak
      <ExternalLink size={10} />
    </a>
  );
}
