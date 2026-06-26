import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  GitCompare,
  Quote,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { confidenceLabel } from '@/lib/report';
import type { ReportContent } from '@/lib/types';
import { recommendationLabel } from '@/lib/utils';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.getReport(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading report...</div>;
  if (error || !report?.reportJson)
    return <div className="p-8 text-destructive">Report not found</div>;

  const content = report.reportJson as ReportContent;
  const rec = content.executiveRecommendation;
  const signalQuality = content.signalQuality ?? {
    criteria: [],
    meanKendallTau: 0,
    meanMajorityVoteProbability: 0,
    criteriaWithCycles: [],
    strongestCriteria: [],
    weakestCriteria: [],
    invalidityFlags: [],
  };
  const calibration = content.calibration ?? {
    status: 'uncalibrated' as const,
    outcomeSamples: 0,
    note: 'This report was generated before outcome calibration metadata existed.',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
          Decision report
        </p>
        <h1 className="font-display text-3xl md:text-4xl">{rec.action}</h1>
        <div className="flex items-center gap-3 mt-4">
          <Badge variant="success">Confidence: {confidenceLabel(rec.confidence)}</Badge>
        </div>
      </div>

      <Card className="mb-8 border-primary/30 glow-amber">
        <CardHeader>
          <CardTitle>Executive recommendation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg">{rec.reason}</p>
          <p className="text-muted-foreground">{rec.modification}</p>
          {rec.doNotShip.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <span>Do not ship: {rec.doNotShip.join(', ')}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            {rec.confidenceReason}
          </p>
        </CardContent>
      </Card>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Variant ranking</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Rank</th>
                <th className="py-2 pr-4">Variant</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Recommendation</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {content.rankings.map((r) => (
                <tr key={r.variantId} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">{r.rank}</td>
                  <td className="py-3 pr-4">
                    <span className="text-primary font-medium">{r.variantLabel}</span>{' '}
                    {r.variantName}
                  </td>
                  <td className="py-3 pr-4">{r.overallScore}</td>
                  <td className="py-3 pr-4">
                    <RecBadge rec={r.recommendation} />
                  </td>
                  <td className="py-3">{confidenceLabel(r.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitCompare className="h-5 w-5" /> Signal quality
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <MetricCard
            label="Mean agreement"
            value={signalQuality.meanKendallTau.toFixed(2)}
            detail="Kendall-style rank alignment"
          />
          <MetricCard
            label="Majority strength"
            value={`${Math.round(signalQuality.meanMajorityVoteProbability * 100)}%`}
            detail="Average pairwise majority"
          />
          <MetricCard
            label="Preference cycles"
            value={String(signalQuality.criteriaWithCycles.length)}
            detail={
              signalQuality.criteriaWithCycles.length
                ? signalQuality.criteriaWithCycles.join(', ')
                : 'No criterion cycles detected'
            }
          />
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pl-4 pr-3">Criterion</th>
                  <th className="py-2 pr-3">Signal</th>
                  <th className="py-2 pr-3">Consensus</th>
                  <th className="py-2 pr-3">Agreement</th>
                  <th className="py-2 pr-4">Order checks</th>
                </tr>
              </thead>
              <tbody>
                {signalQuality.criteria.map((c) => (
                  <tr key={c.criterion} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pl-4 pr-3 font-medium">{c.criterionLabel}</td>
                    <td className="py-3 pr-3 capitalize">{c.signalStrength}</td>
                    <td className="py-3 pr-3">
                      {c.consensusVariantLabel ? `Variant ${c.consensusVariantLabel}` : '—'}
                    </td>
                    <td className="py-3 pr-3">{c.meanKendallTau.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {c.orderInconsistentPairs} inconsistent · {c.lowConfidencePairs} low
                      confidence
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Why the winner won
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {content.whyWinnerWon.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="text-primary">•</span> {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Where the winner is weak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {content.winnerWeaknesses.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="text-amber-400">•</span> {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {content.borrowFrom.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">What to borrow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {content.borrowFrom.map((b) => (
              <div key={b.variantLabel} className="text-sm">
                <span className="font-medium text-primary">Variant {b.variantLabel}:</span>{' '}
                <span className="text-muted-foreground">{b.elements.join(', ')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Quote className="h-5 w-5" /> Human evaluator evidence
        </h2>
        <div className="grid gap-4">
          {content.humanEvidence.map((h) => (
            <Card key={`${h.role}: ${h.quote}`}>
              <CardContent className="p-4">
                <p className="text-sm italic">&ldquo;{h.quote}&rdquo;</p>
                <p className="text-xs text-muted-foreground mt-2">— {h.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {(signalQuality.invalidityFlags.length > 0 || calibration) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Calibration and validity
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Outcome calibration</CardDescription>
                <CardTitle className="text-base capitalize">
                  {calibration.status.replace(/_/g, ' ')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {calibration.note}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Validity warnings</CardDescription>
                <CardTitle className="text-base">
                  {signalQuality.invalidityFlags.length} flags
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                {signalQuality.invalidityFlags.slice(0, 4).map((flag) => (
                  <p key={`${flag.level}: ${flag.description}`}>
                    <span className="text-foreground capitalize">{flag.level}</span>:{' '}
                    {flag.description}
                  </p>
                ))}
                {signalQuality.invalidityFlags.length === 0 && <p>No agent validity warnings.</p>}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5" /> AI agent findings
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Consensus</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {content.agentFindings.consensus.map((c) => (
                <p key={c}>• {c}</p>
              ))}
            </CardContent>
          </Card>
          {content.agentFindings.disagreement.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Disagreement</CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-muted-foreground">
                {content.agentFindings.disagreement.map((d) => (
                  <p key={d}>• {d}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Recommended next test</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>{content.nextTest.description}</p>
          <p>
            <span className="text-foreground font-medium">Modification:</span>{' '}
            {content.nextTest.modification}
          </p>
          <p>
            <span className="text-foreground font-medium">Primary metric:</span>{' '}
            {content.nextTest.primaryMetric}
          </p>
          <p>
            <span className="text-foreground font-medium">Secondary:</span>{' '}
            {content.nextTest.secondaryMetrics.join(', ')}
          </p>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Decision memory</CardTitle>
          <CardDescription>Recorded for future learning</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">Decision:</span>{' '}
            {content.decisionMemory.decision}
          </p>
          <p>
            <span className="text-foreground font-medium">Assumption:</span>{' '}
            {content.decisionMemory.assumption}
          </p>
          <p>
            <span className="text-foreground font-medium">Expected:</span>{' '}
            {content.decisionMemory.expectedOutcome}
          </p>
          <p>
            <span className="text-foreground font-medium">Review:</span>{' '}
            {content.decisionMemory.reviewDate}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RecBadge({ rec }: { rec: string }) {
  const variant =
    rec === 'ship'
      ? 'success'
      : rec === 'kill'
        ? 'danger'
        : rec === 'borrow'
          ? 'warning'
          : 'secondary';
  return <Badge variant={variant as 'success'}>{recommendationLabel(rec)}</Badge>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}
