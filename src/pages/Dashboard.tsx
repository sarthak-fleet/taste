import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, FileText, Clock, CheckCircle } from "lucide-react";
import { api, DEMO_WORKSPACE_ID } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, studyStatusLabel } from "@/lib/utils";

function statusVariant(status: string): "default" | "secondary" | "success" | "warning" {
  if (status === "completed") return "success";
  if (status === "evaluating" || status === "generating_report") return "warning";
  if (status === "draft") return "secondary";
  return "default";
}

export default function Dashboard() {
  const { data: studies, isLoading, error } = useQuery({
    queryKey: ["studies", DEMO_WORKSPACE_ID],
    queryFn: () => api.getStudies(DEMO_WORKSPACE_ID),
  });

  const draft = studies?.filter((s) => s.status === "draft") ?? [];
  const active = studies?.filter((s) => ["evaluating", "generating_report", "pending_review"].includes(s.status)) ?? [];
  const completed = studies?.filter((s) => s.status === "completed") ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Studies</h1>
          <p className="text-muted-foreground text-sm mt-1">Demo workspace — pre-A/B variant decisions</p>
        </div>
        <Button asChild>
          <Link to="/studies/new">
            <Plus className="h-4 w-4" /> New study
          </Link>
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading studies...</p>}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-6">
            <p className="text-destructive">Could not load studies. Is the API running?</p>
            <p className="text-sm text-muted-foreground mt-2">
              Run <code className="bg-muted px-1 rounded">pnpm dev:full</code> for full stack, or{" "}
              <code className="bg-muted px-1 rounded">pnpm db:migrate:local && pnpm db:seed</code> first.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && studies?.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No studies yet</h2>
            <p className="text-muted-foreground mb-6">Submit 2–5 variants to get your first recommendation.</p>
            <Button asChild>
              <Link to="/studies/new">Create study</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Active
          </h2>
          <div className="grid gap-4">{active.map((s) => <StudyCard key={s.id} study={s} />)}</div>
        </section>
      )}

      {draft.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Drafts</h2>
          <div className="grid gap-4">{draft.map((s) => <StudyCard key={s.id} study={s} />)}</div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> Completed
          </h2>
          <div className="grid gap-4">{completed.map((s) => <StudyCard key={s.id} study={s} />)}</div>
        </section>
      )}
    </div>
  );
}

function StudyCard({ study }: { study: import("@/lib/api").Study }) {
  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              <Link to={`/studies/${study.id}`} className="hover:text-primary transition-colors">
                {study.name}
              </Link>
            </CardTitle>
            <CardDescription>
              {study.productName ?? "No product"} · {study.targetUserRole ?? "Target user TBD"}
            </CardDescription>
          </div>
          <Badge variant={statusVariant(study.status)}>{studyStatusLabel(study.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{formatDate(study.createdAt)}</span>
        {study.status === "completed" && (
          <Link to={`/studies/${study.id}/report`} className="text-primary hover:underline">
            View report →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
