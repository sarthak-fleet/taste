import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, FileText, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, studyStatusLabel } from "@/lib/utils";
import { SimulationPanel } from "@/components/SimulationPanel";
import { AgentEvaluationOverlay } from "@/components/AgentEvaluationOverlay";
import { resultFromLaunchResponse } from "@/lib/evaluationOverlay";

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEvalOverlay, setShowEvalOverlay] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["study", id],
    queryFn: () => api.getStudy(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (error || !data) return <div className="p-8 text-destructive">Study not found</div>;

  const { study, variants, report } = data;

  async function runLaunch() {
    const launched = await api.launchStudy(id!);
    return resultFromLaunchResponse({ ...launched, variants });
  }

  function handleOverlayClose() {
    setShowEvalOverlay(false);
    queryClient.invalidateQueries({ queryKey: ["study", id] });
    navigate(`/studies/${id}/report`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold">{study.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {study.productName} · Created {formatDate(study.createdAt)}
          </p>
        </div>
        <Badge>{studyStatusLabel(study.status)}</Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Target user</CardDescription>
            <CardTitle className="text-base">{study.targetUserRole ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Objective</CardDescription>
            <CardTitle className="text-base">{study.primaryObjective?.replace(/_/g, " ") ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Variants</CardDescription>
            <CardTitle className="text-base">{variants.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {study.studyBrief && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Study brief</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{study.studyBrief}</pre>
          </CardContent>
        </Card>
      )}

      <SimulationPanel studyId={study.id} variants={variants} />

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Variants</h2>
        <div className="grid gap-4">
          {variants.map((v) => (
            <Card key={v.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    <span className="text-primary mr-2">Variant {v.label}</span>
                    {v.name}
                  </CardTitle>
                  {v.lockedAt && <Badge variant="secondary">Locked</Badge>}
                </div>
                {v.hypothesis && <CardDescription>{v.hypothesis}</CardDescription>}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {v.description && <p className="mb-2">{v.description}</p>}
                {v.assetUrl && (
                  <a href={v.assetUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                    View asset <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        {study.status === "draft" && (
          <Button onClick={() => setShowEvalOverlay(true)} disabled={showEvalOverlay}>
            <Rocket className="h-4 w-4" />
            Launch study
          </Button>
        )}
        {report && (
          <Button asChild variant="secondary">
            <Link to={`/studies/${id}/report`}>
              <FileText className="h-4 w-4" /> View report
            </Link>
          </Button>
        )}
      </div>

      <AgentEvaluationOverlay
        open={showEvalOverlay}
        taskTitle={study.name}
        taskSubtitle={study.productName ?? study.targetUserRole}
        variants={variants.map((v) => ({ label: v.label, name: v.name }))}
        onRun={runLaunch}
        onClose={handleOverlayClose}
      />
    </div>
  );
}
