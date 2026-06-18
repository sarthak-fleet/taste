import type { AgentOutput, DimensionScores } from "./types";

export interface AgentDefinition {
  slug: string;
  name: string;
  description: string;
  agentType: string;
  focusAreas: string[];
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    slug: "ux_clarity",
    name: "UX Clarity Agent",
    description: "Evaluates layout hierarchy, product explanation, and next-action clarity.",
    agentType: "ux_clarity",
    focusAreas: ["clarity", "firstActionClarity", "friction"],
  },
  {
    slug: "skeptical_buyer",
    name: "Skeptical Target User",
    description: "Challenges value prop, trust signals, and likelihood to continue.",
    agentType: "skeptical_buyer",
    focusAreas: ["trust", "relevance", "conversionIntent"],
  },
  {
    slug: "conversion_funnel",
    name: "Conversion / Funnel Agent",
    description: "Analyzes CTA strength, signup intent, and funnel drop-off risk.",
    agentType: "conversion",
    focusAreas: ["conversionIntent", "firstActionClarity", "perceivedValue"],
  },
  {
    slug: "technical_user",
    name: "Technical User Agent",
    description: "For devtool/SaaS: setup clarity, technical credibility, jargon quality.",
    agentType: "technical",
    focusAreas: ["relevance", "trust", "completionConfidence"],
  },
  {
    slug: "copy_critic",
    name: "Copy Critic Agent",
    description: "Headline strength, messaging specificity, generic-copy flags.",
    agentType: "copy",
    focusAreas: ["clarity", "differentiation", "perceivedValue"],
  },
  {
    slug: "accessibility_basics",
    name: "Accessibility / Basics Agent",
    description: "Readability, contrast, text density, mobile layout concerns.",
    agentType: "accessibility",
    focusAreas: ["clarity", "friction"],
  },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededScore(seed: number, min: number, max: number): number {
  const v = (seed % 100) / 100;
  return Math.round((min + v * (max - min)) * 10) / 10;
}

export function runMockAgentEvaluation(params: {
  agentSlug: string;
  variantId: string;
  variantLabel: string;
  variantName: string;
  variantDescription?: string;
  studyContext: {
    productName: string;
    studyType: string;
    targetUserRole: string;
    primaryObjective: string;
  };
  variantIndex: number;
  totalVariants: number;
}): AgentOutput {
  const agent = AGENT_DEFINITIONS.find((a) => a.slug === params.agentSlug)!;
  const seed = hashString(
    `${params.agentSlug}:${params.variantId}:${params.studyContext.productName}`,
  );

  const baseQuality = seededScore(seed, 2.5, 4.8);
  const indexBonus = params.totalVariants > 1 ? (params.totalVariants - params.variantIndex) * 0.15 : 0;

  const scores: Partial<DimensionScores> = {
    clarity: Math.min(5, seededScore(seed + 1, 2, 5) + indexBonus * 0.3),
    relevance: Math.min(5, seededScore(seed + 2, 2.5, 5)),
    trust: Math.min(5, seededScore(seed + 3, 2, 4.5)),
    firstActionClarity: Math.min(5, seededScore(seed + 4, 2, 5) + indexBonus * 0.5),
    perceivedValue: Math.min(5, seededScore(seed + 5, 2.5, 4.8)),
    friction: Math.max(1, seededScore(seed + 6, 1.5, 4) - indexBonus * 0.3),
    differentiation: Math.min(5, seededScore(seed + 7, 2, 4.5)),
    completionConfidence: Math.min(5, seededScore(seed + 8, 2.5, 5) + indexBonus * 0.2),
    conversionIntent: Math.min(5, seededScore(seed + 9, 2, 4.8) + indexBonus * 0.3),
  };

  const predictedRank = Math.max(1, params.totalVariants - params.variantIndex);
  const confidence = Math.min(0.95, 0.45 + baseQuality * 0.1);

  const findings = generateFindings(agent, params, scores);
  const recommendation = generateRecommendation(agent, params, scores);
  const validityFlags = generateValidityFlags(params, scores);

  return {
    variantId: params.variantId,
    variantLabel: params.variantLabel,
    variantName: params.variantName,
    agentId: agent.slug,
    agentSlug: agent.slug,
    agentName: agent.name,
    scores,
    prediction: {
      predictedRank,
      predictedMetric: params.studyContext.primaryObjective || "task_completion",
      confidence,
    },
    findings,
    validityFlags,
    recommendation,
  };
}

function generateFindings(
  agent: AgentDefinition,
  params: { variantLabel: string; variantName: string; variantDescription?: string },
  scores: Partial<DimensionScores>,
): AgentOutput["findings"] {
  const findings: AgentOutput["findings"] = [];

  if ((scores.clarity ?? 3) < 3) {
    findings.push({
      severity: "high",
      type: "clarity",
      description: `${params.variantLabel}: Product purpose is not immediately clear from the hero section.`,
    });
  } else if ((scores.clarity ?? 3) >= 4) {
    findings.push({
      severity: "low",
      type: "clarity",
      description: `${params.variantLabel}: Value proposition is communicated quickly and specifically.`,
    });
  }

  if ((scores.trust ?? 3) < 3) {
    findings.push({
      severity: "medium",
      type: "trust",
      description: `${params.variantLabel}: Lacks social proof or security signals that would build credibility.`,
    });
  }

  if ((scores.firstActionClarity ?? 3) >= 4) {
    findings.push({
      severity: "low",
      type: "first_action",
      description: `${params.variantLabel}: The primary CTA and next step are immediately obvious.`,
    });
  } else {
    findings.push({
      severity: "high",
      type: "first_action",
      description: `${params.variantLabel}: Multiple competing actions create decision friction.`,
    });
  }

  if (agent.slug === "copy_critic" && (scores.differentiation ?? 3) < 3.5) {
    findings.push({
      severity: "medium",
      type: "copy",
      description: `${params.variantLabel}: Headline uses generic AI/SaaS language without specific differentiation.`,
    });
  }

  if (agent.slug === "technical_user") {
    findings.push({
      severity: (scores.completionConfidence ?? 3) >= 4 ? "low" : "medium",
      type: "technical",
      description:
        (scores.completionConfidence ?? 3) >= 4
          ? `${params.variantLabel}: Setup path feels concrete for technical users.`
          : `${params.variantLabel}: Missing technical context or code examples for developer audience.`,
    });
  }

  return findings.slice(0, 4);
}

function generateRecommendation(
  agent: AgentDefinition,
  params: { variantLabel: string; variantName: string },
  scores: Partial<DimensionScores>,
): string {
  const strong = Object.entries(scores).filter(([, v]) => (v ?? 0) >= 4).map(([k]) => k);
  const weak = Object.entries(scores).filter(([, v]) => (v ?? 0) < 3).map(([k]) => k);

  if (strong.length >= 3) {
    return `Strong candidate. ${params.variantLabel} (${params.variantName}) excels in ${strong.slice(0, 2).join(" and ")}.`;
  }
  if (weak.length >= 2) {
    return `Needs work. Address ${weak.slice(0, 2).join(" and ")} before shipping ${params.variantLabel}.`;
  }
  return `Moderate performance. ${params.variantLabel} is viable but not a clear winner on ${agent.focusAreas.join(", ")}.`;
}

function generateValidityFlags(
  params: { variantLabel: string; variantDescription?: string },
  scores: Partial<DimensionScores>,
): AgentOutput["validityFlags"] {
  const flags: AgentOutput["validityFlags"] = [];

  if (!params.variantDescription?.trim()) {
    flags.push({
      level: "minor",
      type: "missing_asset",
      description: `${params.variantLabel}: Limited variant description, so evidence is inferred from the study brief.`,
    });
  }

  if ((scores.clarity ?? 3) < 2.4 && (scores.relevance ?? 3) < 2.8) {
    flags.push({
      level: "major",
      type: "cannot_judge",
      description: `${params.variantLabel}: Agent could not form a reliable judgment because clarity and relevance were both low.`,
    });
  } else if ((scores.trust ?? 3) < 2.4) {
    flags.push({
      level: "minor",
      type: "quality_warning",
      description: `${params.variantLabel}: Trust evidence is weak; verify claims before shipping.`,
    });
  }

  return flags;
}
