import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bot, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface VariantPreview {
  name: string;
  description: string;
  previewColor?: string;
  highlights?: string[];
}

export default function ArenaBattle() {
  const { slug } = useParams<{ slug: string }>();
  const [voted, setVoted] = useState(false);
  const [prediction, setPrediction] = useState<"a" | "b" | null>(null);
  const [confidence, setConfidence] = useState(70);
  const [rationale, setRationale] = useState("");
  const [voterName, setVoterName] = useState("");
  const [agentCritiques, setAgentCritiques] = useState<Array<{
    agent: string;
    preferred: string;
    summaryA: string;
    summaryB: string;
  }> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["arena-battle", slug],
    queryFn: () => api.getArenaBattle(slug!),
    enabled: !!slug,
  });

  const voteMutation = useMutation({
    mutationFn: () =>
      api.voteArena(slug!, {
        predictedVariantId: prediction,
        confidence: confidence / 100,
        rationale,
        voterName: voterName || undefined,
      }),
    onSuccess: (res) => {
      setVoted(true);
      setAgentCritiques(res.agentCritiques as typeof agentCritiques);
      toast.success("Prediction submitted");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading battle...</div>;
  if (!data) return <div className="p-8 text-destructive">Battle not found</div>;

  const battle = data.battle as {
    title: string;
    description: string;
    goal: string;
    status: string;
    winningVariantId?: string;
    variantA: VariantPreview;
    variantB: VariantPreview;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Badge variant="warning" className="mb-3">Product Arena</Badge>
      <h1 className="font-display text-3xl mb-2">{battle.title}</h1>
      <p className="text-muted-foreground mb-8">{battle.description}</p>

      <p className="text-sm font-medium mb-4">
        Goal: <span className="text-primary">{battle.goal.replace(/_/g, " ")}</span>
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <VariantCard
          label="A"
          variant={battle.variantA}
          selected={prediction === "a"}
          onSelect={() => !voted && setPrediction("a")}
          disabled={voted}
        />
        <VariantCard
          label="B"
          variant={battle.variantB}
          selected={prediction === "b"}
          onSelect={() => !voted && setPrediction("b")}
          disabled={voted}
        />
      </div>

      {!voted ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your prediction</CardTitle>
            <CardDescription>Which variant do you predict will perform better?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Confidence: {confidence}%</Label>
              <input
                type="range"
                min={50}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full mt-2 accent-primary"
              />
            </div>
            <div>
              <Label>Rationale</Label>
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why do you predict this variant wins?"
              />
            </div>
            <div>
              <Label>Name (optional, for leaderboard)</Label>
              <Input value={voterName} onChange={(e) => setVoterName(e.target.value)} placeholder="Your name" />
            </div>
            <Button
              onClick={() => voteMutation.mutate()}
              disabled={!prediction || !rationale || voteMutation.isPending}
            >
              Submit prediction
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/30">
            <CardContent className="p-6 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">Your prediction: Variant {prediction?.toUpperCase()}, {confidence}%</p>
                <p className="text-sm text-muted-foreground">{rationale}</p>
              </div>
            </CardContent>
          </Card>

          {agentCritiques && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Bot className="h-5 w-5" /> AI-agent critique
              </h2>
              <div className="grid gap-4">
                {agentCritiques.map((c) => (
                  <Card key={c.agent}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm capitalize">{c.agent.replace(/_/g, " ")}</CardTitle>
                      <CardDescription>Preferred: Variant {c.preferred.toUpperCase()}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground space-y-1">
                      <p><span className="text-foreground">A:</span> {c.summaryA}</p>
                      <p><span className="text-foreground">B:</span> {c.summaryB}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {battle.status === "revealed" && battle.winningVariantId && (
            <Card className="border-emerald-500/30">
              <CardContent className="p-6">
                <p className="font-medium">
                  Result revealed: Variant {battle.winningVariantId.toUpperCase()} won the real test.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {prediction === battle.winningVariantId
                    ? "Your prediction was correct!"
                    : "Your prediction differed from the outcome."}
                </p>
              </CardContent>
            </Card>
          )}

          {data.votes > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Community: {data.voteCounts.a} votes for A, {data.voteCounts.b} votes for B
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VariantCard({
  label,
  variant,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  variant: VariantPreview;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`text-left rounded-lg border-2 transition-all overflow-hidden ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
      } ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <div
        className="h-32 p-6 flex flex-col justify-end"
        style={{ backgroundColor: variant.previewColor ?? "#1a1a2e" }}
      >
        <span className="text-xs font-bold text-white/60">VARIANT {label}</span>
        <h3 className="text-white font-semibold text-lg">{variant.name}</h3>
      </div>
      <div className="p-4 bg-card">
        <p className="text-sm text-muted-foreground mb-3">{variant.description}</p>
        {variant.highlights && (
          <ul className="text-xs space-y-1">
            {variant.highlights.map((h) => (
              <li key={h} className="text-muted-foreground">• {h}</li>
            ))}
          </ul>
        )}
      </div>
    </button>
  );
}
