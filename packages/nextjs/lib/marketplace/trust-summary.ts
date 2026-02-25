export interface ComposeTrustInput {
  ownerMatch: boolean;
  reputationScore: number;
  validationScore: number;
  freshnessSeconds: number;
  existingTrustScore: number;
}

export interface ComposedTrust {
  trustSummary: {
    owner_match: boolean;
    reputation_score: number;
    validation_score: number;
    freshness_seconds: number;
  };
  trustScore: number;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function composeTrustSummary(input: ComposeTrustInput): ComposedTrust {
  const reputation = clampScore(input.reputationScore);
  const validation = clampScore(input.validationScore);
  const freshnessSeconds = Math.max(0, Math.floor(input.freshnessSeconds));
  const freshnessPenalty = Math.min(20, Math.floor(freshnessSeconds / 300));
  const ownerBoost = input.ownerMatch ? 15 : 0;

  const blended =
    reputation * 0.5 + validation * 0.3 + clampScore(input.existingTrustScore) * 0.2;
  const trustScore = clampScore(blended + ownerBoost - freshnessPenalty);

  return {
    trustSummary: {
      owner_match: input.ownerMatch,
      reputation_score: reputation,
      validation_score: validation,
      freshness_seconds: freshnessSeconds,
    },
    trustScore,
  };
}

