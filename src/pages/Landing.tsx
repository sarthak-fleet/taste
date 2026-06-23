import { ArrowRight, Bot, CheckCircle2, GitCompareArrows, Target, Users, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentEvaluationOverlay } from '@/components/AgentEvaluationOverlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Landing() {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <GitCompareArrows className="h-5 w-5 text-primary" />
            ShipRank
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/arena" className="text-muted-foreground hover:text-foreground">
              Product Arena
            </Link>
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Button asChild size="sm">
              <Link to="/studies/new">Start a study</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden grid-bg">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 py-24 md:py-32 relative">
          <Badge variant="secondary" className="mb-6">
            Pre-A/B testing for software teams
          </Badge>
          <h1 className="font-display text-5xl md:text-7xl leading-[1.05] max-w-3xl">
            Choose what to ship
            <span className="text-primary italic"> before </span>
            you burn traffic
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Upload 2–5 product variants. ShipRank runs a panel of specialized AI evaluator agents,
            then returns a ranked recommendation in minutes — which variant to ship, which to kill,
            and what to borrow. Add human validation later when you have matched evaluators.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button asChild size="lg">
              <Link to="/studies/new">
                Rank my variants <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" onClick={() => setShowDemo(true)}>
              Watch 2,000 agents judge
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Starting with SaaS & devtool landing pages and onboarding flows.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="font-display text-3xl md:text-4xl mb-4">The bottleneck shifted</h2>
        <p className="text-muted-foreground max-w-2xl mb-12">
          AI makes creation cheap. Teams drown in variants. The hard part is no longer building —
          it&apos;s choosing what should ship.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Zap,
              title: 'Too many variants',
              desc: '10 landing pages, 10 onboarding flows, 10 pricing pages — all plausible, none validated.',
            },
            {
              icon: Target,
              title: 'Not enough traffic',
              desc: "You can't A/B test everything. You need a pre-A/B decision layer.",
            },
            {
              icon: CheckCircle2,
              title: 'Decisions, not feedback',
              desc: "Ship Variant B. Borrow D's trust section. Kill A and C. With evidence and confidence.",
            },
          ].map((item) => (
            <Card key={item.title} className="glow-amber">
              <CardHeader>
                <item.icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <h2 className="font-display text-3xl mb-12 text-center">How it works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: '01',
                title: 'Submit variants',
                desc: 'URLs, screenshots, or prototypes. 2–5 options.',
              },
              {
                step: '02',
                title: 'Agents evaluate',
                desc: '6 specialized AI evaluator agents score every variant in minutes.',
              },
              {
                step: '03',
                title: 'Get the report',
                desc: 'Ranked recommendation with agent evidence — ship, kill, or borrow.',
              },
              {
                step: '04',
                title: 'Humans optional',
                desc: 'Add matched evaluators later to validate before live A/B.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-4xl font-display text-primary/40 mb-3">{item.step}</div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="warning" className="mb-4">
              Product Arena
            </Badge>
            <h2 className="font-display text-3xl md:text-4xl mb-4">Public variant battles</h2>
            <p className="text-muted-foreground mb-6">
              Two variants enter. Humans and AI agents predict which wins. Best predictors climb the
              leaderboard. Your distribution wedge and evaluator recruitment engine.
            </p>
            <Button asChild variant="outline">
              <Link to="/arena">Explore battles</Link>
            </Button>
          </div>
          <Card className="border-primary/20">
            <CardContent className="p-6 font-mono text-sm space-y-2 text-muted-foreground">
              <p className="text-foreground font-sans font-medium">Sample output:</p>
              <p>
                <span className="text-primary">Recommendation:</span> Ship Variant B.
              </p>
              <p>Borrow the trust section from Variant D.</p>
              <p>Do not ship A and C.</p>
              <p className="text-foreground/70">Confidence: Medium-high</p>
              <p className="text-xs pt-2 border-t border-border">
                5/6 AI agents ranked B highest for first-action clarity.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex -space-x-2">
              <Bot className="h-10 w-10 p-2 rounded-full bg-secondary border border-border" />
              <Users className="h-10 w-10 p-2 rounded-full bg-secondary border border-border" />
            </div>
            <div>
              <p className="font-semibold">Agent-first. Humans when ready.</p>
              <p className="text-sm text-muted-foreground">
                No evaluator cold-start required to get a decision.
              </p>
            </div>
          </div>
          <Button asChild size="lg">
            <Link to="/studies/new">Start your first study</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ShipRank — Judgment infrastructure for product teams
      </footer>

      <AgentEvaluationOverlay
        open={showDemo}
        taskTitle="Which onboarding flow should we ship?"
        taskSubtitle="Devtool · backend engineers · 4 variants"
        variants={[
          { label: 'A', name: 'Marketing-first' },
          { label: 'B', name: 'Code-first' },
          { label: 'C', name: 'Checklist' },
          { label: 'D', name: 'AI-guided' },
        ]}
        greenRatio={0.71}
        onRun={async () => {
          await new Promise((r) => setTimeout(r, 16000));
          return { winnerLabel: 'B', greenRatio: 0.71 };
        }}
        onClose={() => setShowDemo(false)}
      />
    </div>
  );
}
