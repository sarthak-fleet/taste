import { deriveGreenRatioFromWinner } from "./agentCinema";
import type { Report } from "./api";

export function resultFromLaunchResponse(data: {
  report?: Report & { reportJson?: { executiveRecommendation?: { variantLabel?: string } } };
  variants?: Array<{ id: string; label: string }>;
}) {
  const label =
    data.report?.reportJson?.executiveRecommendation?.variantLabel?.replace(/^Variant\s*/i, "") ??
    data.variants?.find((v) => v.id === data.report?.recommendationVariantId)?.label;

  const variants = data.variants?.map((v) => ({ label: v.label })) ?? [];
  return {
    winnerLabel: label,
    greenRatio: deriveGreenRatioFromWinner(label, variants),
    raw: data,
  };
}

export function resultFromSimulation(sim: {
  summary: { agentPick?: { variantLabel: string } | null; combinedPick?: { variantLabel: string } | null };
  agentConsensus: Array<{ variantLabel: string; votes: number }>;
}) {
  const pick = sim.summary.combinedPick ?? sim.summary.agentPick;
  const label = pick?.variantLabel;
  const totalVotes = sim.agentConsensus.reduce((s, c) => s + c.votes, 0);
  const topVotes = sim.agentConsensus[0]?.votes ?? 0;
  const greenRatio = totalVotes ? topVotes / totalVotes : 0.68;

  return {
    winnerLabel: label,
    greenRatio: Math.min(0.85, Math.max(0.52, greenRatio)),
    raw: sim,
  };
}
