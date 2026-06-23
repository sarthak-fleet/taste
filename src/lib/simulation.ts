import { AGENT_DEFINITIONS, runMockAgentEvaluation } from './agents';
import { HUMAN_EVALUATOR_POOL, type HumanEvalResult, runHumanSimulation } from './evaluators';
import {
  buildPairwiseVerdicts,
  criteriaForStudy,
  evaluatorTypeWeight,
  summarizeSignalQuality,
} from './scoring';
import type {
  AgentOutput,
  CriterionDefinition,
  PairwiseVerdict,
  SignalQualitySummary,
} from './types';

export interface AgentSimResult {
  agentSlug: string;
  agentName: string;
  agentType: string;
  outputs: AgentOutput[];
  pairwiseVerdicts: PairwiseVerdict[];
  predictedWinnerVariantId: string;
  predictedWinnerLabel: string;
  avgConfidence: number;
}

export interface ConsensusEntry {
  variantId: string;
  variantLabel: string;
  votes: number;
  weightedVotes: number;
  avgConfidence: number;
  avgScore: number;
}

export interface SimulationResult {
  studyId: string;
  mode: 'agents' | 'humans' | 'full';
  ranAt: string;
  agentPanel: AgentSimResult[];
  humanPanel: HumanEvalResult[];
  criteria: CriterionDefinition[];
  agentConsensus: ConsensusEntry[];
  humanConsensus: ConsensusEntry[];
  signalQuality: SignalQualitySummary;
  agentHumanAgreement: number;
  agentDisagreements: string[];
  summary: {
    agentPick: { variantId: string; variantLabel: string } | null;
    humanPick: { variantId: string; variantLabel: string } | null;
    combinedPick: { variantId: string; variantLabel: string } | null;
  };
}

export function runAgentSimulation(params: {
  studyId: string;
  variants: Array<{ id: string; label: string; name: string; description?: string }>;
  studyContext: {
    productName: string;
    studyType: string;
    targetUserRole: string;
    primaryObjective: string;
  };
  agentSlugs?: string[];
  criteria?: CriterionDefinition[];
}): AgentSimResult[] {
  const agents = params.agentSlugs
    ? AGENT_DEFINITIONS.filter((a) => params.agentSlugs!.includes(a.slug))
    : AGENT_DEFINITIONS;

  const criteria =
    params.criteria ??
    criteriaForStudy(params.studyContext.studyType, params.studyContext.primaryObjective);

  return agents.map((agent) => {
    const outputs: AgentOutput[] = params.variants.map((variant, variantIndex) =>
      runMockAgentEvaluation({
        agentSlug: agent.slug,
        variantId: variant.id,
        variantLabel: variant.label,
        variantName: variant.name,
        variantDescription: variant.description,
        studyContext: params.studyContext,
        variantIndex,
        totalVariants: params.variants.length,
      })
    );
    const pairwiseVerdicts = buildPairwiseVerdicts({
      agentSlug: agent.slug,
      agentName: agent.name,
      outputs,
      criteria,
    });

    const winner = outputs.reduce((best, o) =>
      o.prediction.predictedRank < best.prediction.predictedRank ? o : best
    );
    const avgConfidence = outputs.reduce((s, o) => s + o.prediction.confidence, 0) / outputs.length;

    return {
      agentSlug: agent.slug,
      agentName: agent.name,
      agentType: agent.agentType,
      outputs,
      pairwiseVerdicts,
      predictedWinnerVariantId: winner.variantId,
      predictedWinnerLabel: params.variants.find((v) => v.id === winner.variantId)?.label ?? '?',
      avgConfidence,
    };
  });
}

function buildAgentConsensus(
  agentPanel: AgentSimResult[],
  variants: Array<{ id: string; label: string }>
): ConsensusEntry[] {
  const counts = new Map<string, { votes: number; confidences: number[]; scores: number[] }>();

  for (const v of variants) {
    counts.set(v.id, { votes: 0, confidences: [], scores: [] });
  }

  for (const agent of agentPanel) {
    const entry = counts.get(agent.predictedWinnerVariantId);
    if (entry) {
      entry.votes++;
      entry.confidences.push(agent.avgConfidence);
    }
    for (const output of agent.outputs) {
      const e = counts.get(output.variantId);
      if (e) {
        const dimScores = Object.values(output.scores) as number[];
        const avg = dimScores.length ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 3;
        e.scores.push(avg);
      }
    }
  }

  return variants
    .map((v) => {
      const c = counts.get(v.id)!;
      return {
        variantId: v.id,
        variantLabel: v.label,
        votes: c.votes,
        weightedVotes: c.votes,
        avgConfidence: c.confidences.length
          ? c.confidences.reduce((a, b) => a + b, 0) / c.confidences.length
          : 0,
        avgScore: c.scores.length ? c.scores.reduce((a, b) => a + b, 0) / c.scores.length : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes || b.avgScore - a.avgScore);
}

function buildHumanConsensus(
  humanPanel: HumanEvalResult[],
  variants: Array<{ id: string; label: string }>
): ConsensusEntry[] {
  const counts = new Map<
    string,
    { votes: number; weightedVotes: number; confidences: number[]; scores: number[] }
  >();

  for (const v of variants) {
    counts.set(v.id, { votes: 0, weightedVotes: 0, confidences: [], scores: [] });
  }

  for (const human of humanPanel) {
    const w = evaluatorTypeWeight(human.evaluator.type);
    const entry = counts.get(human.predictedWinnerVariantId);
    if (entry) {
      entry.votes++;
      entry.weightedVotes += w;
      entry.confidences.push(human.confidence);
    }
    for (const vr of human.variantResults) {
      const e = counts.get(vr.variantId);
      if (e) e.scores.push(vr.overall);
    }
  }

  return variants
    .map((v) => {
      const c = counts.get(v.id)!;
      return {
        variantId: v.id,
        variantLabel: v.label,
        votes: c.votes,
        weightedVotes: c.weightedVotes,
        avgConfidence: c.confidences.length
          ? c.confidences.reduce((a, b) => a + b, 0) / c.confidences.length
          : 0,
        avgScore: c.scores.length ? c.scores.reduce((a, b) => a + b, 0) / c.scores.length : 0,
      };
    })
    .sort((a, b) => b.weightedVotes - a.weightedVotes || b.avgScore - a.avgScore);
}

function detectAgentDisagreements(agentPanel: AgentSimResult[]): string[] {
  const picks = new Set(agentPanel.map((a) => a.predictedWinnerVariantId));
  if (picks.size <= 1) return [];

  const byPick = new Map<string, string[]>();
  for (const agent of agentPanel) {
    const list = byPick.get(agent.predictedWinnerVariantId) ?? [];
    list.push(agent.agentName);
    byPick.set(agent.predictedWinnerVariantId, list);
  }

  return [...byPick.entries()].map(
    ([, agents]) => `${agents.join(', ')} preferred different winners`
  );
}

function computeAgreement(
  agentConsensus: ConsensusEntry[],
  humanConsensus: ConsensusEntry[]
): number {
  const agentTop = agentConsensus[0]?.variantId;
  const humanTop = humanConsensus[0]?.variantId;
  if (!agentTop || !humanTop) return 0;
  return agentTop === humanTop ? 1 : 0;
}

export function runFullSimulation(params: {
  studyId: string;
  mode: 'agents' | 'humans' | 'full';
  variants: Array<{ id: string; label: string; name: string; description?: string }>;
  studyContext: {
    productName: string;
    studyType: string;
    targetUserRole: string;
    primaryObjective: string;
  };
}): SimulationResult {
  const criteria = criteriaForStudy(
    params.studyContext.studyType,
    params.studyContext.primaryObjective
  );
  const agentPanel =
    params.mode === 'humans'
      ? []
      : runAgentSimulation({
          studyId: params.studyId,
          variants: params.variants,
          studyContext: params.studyContext,
          criteria,
        });

  const humanPanel =
    params.mode === 'agents'
      ? []
      : runHumanSimulation({
          variants: params.variants,
          studyContext: {
            primaryObjective: params.studyContext.primaryObjective,
            targetUserRole: params.studyContext.targetUserRole,
          },
        });

  const agentConsensus = buildAgentConsensus(agentPanel, params.variants);
  const humanConsensus = buildHumanConsensus(humanPanel, params.variants);
  const signalQuality = summarizeSignalQuality({
    variants: params.variants,
    agentPanel,
    criteria,
  });
  const agentHumanAgreement = computeAgreement(agentConsensus, humanConsensus);

  const agentPick = agentConsensus[0]
    ? { variantId: agentConsensus[0].variantId, variantLabel: agentConsensus[0].variantLabel }
    : null;
  const humanPick = humanConsensus[0]
    ? { variantId: humanConsensus[0].variantId, variantLabel: humanConsensus[0].variantLabel }
    : null;

  // Agent-first: combined pick defaults to agent consensus; humans refine when present
  let combinedPick = agentPick;
  if (agentPick && humanPick) {
    combinedPick = agentPick.variantId === humanPick.variantId ? agentPick : agentPick;
  } else if (humanPick && !agentPick) {
    combinedPick = humanPick;
  }

  return {
    studyId: params.studyId,
    mode: params.mode,
    ranAt: new Date().toISOString(),
    agentPanel,
    humanPanel,
    criteria,
    agentConsensus,
    humanConsensus,
    signalQuality,
    agentHumanAgreement,
    agentDisagreements: detectAgentDisagreements(agentPanel),
    summary: { agentPick, humanPick, combinedPick },
  };
}

export function agentScoreMatrix(
  agentPanel: AgentSimResult[],
  variantLabels: Map<string, string>
): {
  agents: string[];
  variantLabels: string[];
  cells: number[][];
} {
  if (!agentPanel.length) return { agents: [], variantLabels: [], cells: [] };

  const labels = agentPanel[0]!.outputs.map((o) => variantLabels.get(o.variantId) ?? o.variantId);
  const agents = agentPanel.map((a) => a.agentName);

  const cells = agentPanel.map((agent) =>
    agent.outputs.map((output) => {
      const dimScores = Object.values(output.scores) as number[];
      return dimScores.length
        ? Math.round((dimScores.reduce((a, b) => a + b, 0) / dimScores.length) * 10) / 10
        : 0;
    })
  );

  return { agents, variantLabels: labels, cells };
}

export { AGENT_DEFINITIONS, HUMAN_EVALUATOR_POOL };
