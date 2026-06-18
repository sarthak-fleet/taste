import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileText, ExternalLink, Rocket } from "lucide-react";
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

  const captureMutation = useMutation({
    mutationFn: () => api.captureStudy(id!),
    onSuccess: () => {
      toast.success("Visual evidence captured");
      queryClient.invalidateQueries({ queryKey: ["study", id] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (error || !data) return <div className="p-8 text-destructive">Study not found</div>;

  const { study, variants, report } = data;
  const latestEvaluationByVariant = new Map(
    data.visualEvaluations.map((evaluation) => [evaluation.variantId, evaluation]),
  );
  const capturedVariantIds = new Set(latestEvaluationByVariant.keys());
  const capturedCount = variants.filter((variant) => capturedVariantIds.has(variant.id)).length;
  const urlVariantCount = variants.filter((variant) => variant.assetUrl).length;
  const latestEvaluation = data.visualEvaluations[0];
  const latestModel = data.visualEvaluations.find((evaluation) => evaluation.modelId)?.modelId;

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

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardDescription>Visual evidence</CardDescription>
              <CardTitle className="text-base">
                {capturedCount}/{variants.length} variants captured
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => captureMutation.mutate()}
              disabled={captureMutation.isPending || urlVariantCount < 2}
            >
              <Camera className="h-4 w-4" />
              {captureMutation.isPending ? "Capturing..." : "Capture visuals"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {urlVariantCount < 2 && (
            <p>Capture needs at least two variants with URLs.</p>
          )}
          {latestEvaluation ? (
            <div className="grid gap-1 sm:grid-cols-2">
              <p>Latest capture: {formatDate(latestEvaluation.createdAt)}</p>
              <p>Latest model: {latestModel ?? "pending baseline"}</p>
            </div>
          ) : (
            <p>No screenshots captured yet.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const evaluation = latestEvaluationByVariant.get(variant.id);
              return (
                <Badge key={variant.id} variant={evaluation ? "success" : variant.assetUrl ? "secondary" : "warning"}>
                  {variant.label}: {evaluation ? "captured" : variant.assetUrl ? "ready" : "no URL"}
                </Badge>
              );
            })}
          </div>
          </CardContent>
      </Card>

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
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    <span className="text-primary mr-2">Variant {v.label}</span>
                    {v.name}
                  </CardTitle>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {v.lockedAt && <Badge variant="secondary">Locked</Badge>}
                    {capturedVariantIds.has(v.id) && <Badge variant="success">Captured</Badge>}
                  </div>
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
