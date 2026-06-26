import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, GitCompare, Play, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AgentEvaluationOverlay } from '@/components/AgentEvaluationOverlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { resultFromSimulation } from '@/lib/evaluationOverlay';
import type { SimulationResult } from '@/lib/simulation';
import { agentScoreMatrix } from '@/lib/simulation';

export function SimulationPanel({
  studyId,
  variants,
}: {
  studyId: string;
  variants: Array<{ id: string; label: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<'agents' | 'humans'>('agents');

  const { data: simulation, isLoading } = useQuery({
    queryKey: ['simulation', studyId],
    queryFn: () => api.getSimulation(studyId),
    retry: false,
  });

  const simulateMutation = useMutation({
    mutationFn: (mode: 'agents' | 'humans' | 'full') => api.runSimulation(studyId, mode),
    onSuccess: (_, mode) => {
      toast.success(mode === 'humans' ? 'Human validation added' : 'Agent simulation complete');
      queryClient.invalidateQueries({ queryKey: ['simulation', studyId] });
      queryClient.invalidateQueries({ queryKey: ['study', studyId] });
      setShowOverlay(false);
    },
    onError: (e) => {
      toast.error(e.message);
      setShowOverlay(false);
    },
  });

  function startSimulation(mode: 'agents' | 'humans') {
    setOverlayMode(mode);
    setShowOverlay(true);
  }

  async function runWithOverlay() {
    const sim = await api.runSimulation(studyId, overlayMode);
    return resultFromSimulation(sim);
  }

  const labelMap = new Map(variants.map((v) => [v.id, v.label]));
  const result = simulation as SimulationResult | undefined;
  const hasHumans = (result?.humanPanel.length ?? 0) > 0;

  return (
    <section className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Agent evaluation
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Agent-first by default — specialized AI evaluators score every variant in minutes. Human
            validation is optional once you have matched evaluators.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button size="sm" disabled={showOverlay} onClick={() => startSimulation('agents')}>
            <Play className="h-4 w-4" />
            Run agents
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={simulateMutation.isPending}
            onClick={() => simulateMutation.mutate('humans')}
            title="Optional — adds human panel when evaluators are available"
          >
            <Users className="h-4 w-4" /> Add human validation
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading simulation...</p>}

      {!isLoading && !result && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Launch the study to run the agent panel, or click &ldquo;Run agents&rdquo; above.
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <ConsensusCard
              title="Agent consensus"
              icon={Bot}
              pick={result.summary.agentPick ?? result.summary.combinedPick}
              consensus={result.agentConsensus}
              primary
            />
            <ConsensusCard
              title="Human validation"
              icon={Users}
              pick={hasHumans ? result.summary.humanPick : null}
              consensus={result.humanConsensus}
              emptyLabel={hasHumans ? undefined : 'Not run — optional'}
            />
            {hasHumans && (
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>Agent + human</CardDescription>
                  <CardTitle className="text-base">
                    {result.summary.combinedPick
                      ? `Variant ${result.summary.combinedPick.variantLabel}`
                      : '—'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Agreement:{' '}
                  <span
                    className={result.agentHumanAgreement ? 'text-emerald-400' : 'text-amber-400'}
                  >
                    {result.agentHumanAgreement ? 'Aligned' : 'Disagree'}
                  </span>
                </CardContent>
              </Card>
            )}
          </div>

          {result.agentPanel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" /> Agent tournament
                </CardTitle>
                <CardDescription>
                  {result.agentPanel.length} agents × {variants.length} variants — primary signal
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <AgentMatrix result={result} labelMap={labelMap} />
              </CardContent>
            </Card>
          )}

          {result.signalQuality && result.signalQuality.criteria.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitCompare className="h-4 w-4" /> Pairwise signal
                </CardTitle>
                <CardDescription>
                  Order-checked criteria, majority strength, and weak spots before the final report
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4">Criterion</th>
                      <th className="py-2 pr-4">Consensus</th>
                      <th className="py-2 pr-4">Signal</th>
                      <th className="py-2">Order checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.signalQuality.criteria.map((criterion) => (
                      <tr key={criterion.criterion} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium">{criterion.criterionLabel}</td>
                        <td className="py-2 pr-4">
                          {criterion.consensusVariantLabel
                            ? `Variant ${criterion.consensusVariantLabel}`
                            : '—'}
                        </td>
                        <td className="py-2 pr-4 capitalize">
                          {criterion.signalStrength} ·{' '}
                          {Math.round(criterion.majorityVoteProbability * 100)}%
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {criterion.orderInconsistentPairs} inconsistent
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {result.agentDisagreements.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Agent disagreements</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {result.agentDisagreements.map((d) => (
                  <p key={d}>• {d}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {hasHumans && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Human validation panel
                </CardTitle>
                <CardDescription>
                  Optional layer — {result.humanPanel.length} evaluators
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.humanPanel.map((h) => (
                    <div
                      key={h.evaluator.name}
                      className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0 text-sm"
                    >
                      <div>
                        <p className="font-medium">{h.evaluator.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {h.evaluator.role} · {h.evaluator.type.replace(/_/g, ' ')}
                        </p>
                        {h.quote && (
                          <p className="text-xs italic text-muted-foreground mt-1">
                            &ldquo;{h.quote}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="success">Variant {h.predictedWinnerLabel}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(h.confidence * 100)}% confidence
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AgentEvaluationOverlay
        open={showOverlay}
        taskTitle="Agent panel evaluation"
        taskSubtitle={variants.map((v) => `Variant ${v.label}`).join(' · ')}
        variants={variants}
        onRun={runWithOverlay}
        onClose={() => setShowOverlay(false)}
        onFinished={() => {
          queryClient.invalidateQueries({ queryKey: ['simulation', studyId] });
          queryClient.invalidateQueries({ queryKey: ['study', studyId] });
        }}
      />
    </section>
  );
}

function ConsensusCard({
  title,
  icon: Icon,
  pick,
  consensus,
  primary,
  emptyLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  pick: { variantLabel: string } | null;
  consensus: SimulationResult['agentConsensus'];
  primary?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Card className={primary ? 'border-primary/30' : undefined}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {title}
        </CardDescription>
        <CardTitle className="text-base">
          {pick ? `Variant ${pick.variantLabel}` : (emptyLabel ?? '—')}
        </CardTitle>
      </CardHeader>
      {pick && (
        <CardContent className="text-xs text-muted-foreground space-y-1">
          {consensus.slice(0, 3).map((c) => (
            <p key={c.variantId}>
              {c.variantLabel}: {c.votes} votes · avg {c.avgScore.toFixed(1)}
            </p>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function AgentMatrix({
  result,
  labelMap,
}: {
  result: SimulationResult;
  labelMap: Map<string, string>;
}) {
  const matrix = agentScoreMatrix(result.agentPanel, labelMap);
  const winnerByAgent = new Map(
    result.agentPanel.map((a) => [a.agentName, a.predictedWinnerLabel])
  );

  if (!matrix.cells.length) return null;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border">
          <th className="py-2 pr-4">Agent</th>
          {matrix.variantLabels.map((l) => (
            <th key={l} className="py-2 px-2 text-center">
              {l}
            </th>
          ))}
          <th className="py-2 pl-2">Pick</th>
        </tr>
      </thead>
      <tbody>
        {matrix.agents.map((agent, i) => (
          <tr key={agent} className="border-b border-border/50">
            <td className="py-2 pr-4 font-medium">{agent}</td>
            {matrix.cells[i]?.map((score, j) => (
              <td key={`${agent}-${matrix.variantLabels[j]}`} className="py-2 px-2 text-center">
                <span
                  className={
                    score >= 4
                      ? 'text-emerald-400 font-medium'
                      : score < 3
                        ? 'text-red-400'
                        : 'text-muted-foreground'
                  }
                >
                  {score}
                </span>
              </td>
            ))}
            <td className="py-2 pl-2">
              <Badge variant="secondary">{winnerByAgent.get(agent)}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
