import { useCallback, useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import { AgentCinemaVerdict } from "./AgentCinemaVerdict";
import { cinemaMinDurationMs, deriveGreenRatioFromWinner } from "@/lib/agentCinema";
import { Button } from "@/components/ui/button";

export interface EvaluationOverlayResult {
  winnerLabel?: string;
  greenRatio: number;
  raw?: unknown;
}

interface AgentEvaluationOverlayProps {
  open: boolean;
  taskTitle: string;
  taskSubtitle?: string;
  variants: Array<{ label: string; name: string }>;
  greenRatio?: number;
  onRun: () => Promise<EvaluationOverlayResult | void>;
  onClose: () => void;
  onFinished?: (result: EvaluationOverlayResult) => void;
}

export function AgentEvaluationOverlay({
  open,
  taskTitle,
  taskSubtitle,
  variants,
  greenRatio: greenRatioProp,
  onRun,
  onClose,
  onFinished,
}: AgentEvaluationOverlayProps) {
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [apiResult, setApiResult] = useState<EvaluationOverlayResult | null>(null);
  const [cinemaDone, setCinemaDone] = useState(false);
  const [greenRatio, setGreenRatio] = useState(greenRatioProp ?? 0.68);

  useEffect(() => {
    if (!open) {
      setPhase("running");
      setApiResult(null);
      setCinemaDone(false);
      setGreenRatio(greenRatioProp ?? 0.68);
      return;
    }

    let cancelled = false;
    onRun()
      .then((res) => {
        if (cancelled) return;
        const result: EvaluationOverlayResult = {
          winnerLabel: res?.winnerLabel,
          greenRatio: res?.greenRatio ?? deriveGreenRatioFromWinner(res?.winnerLabel, variants),
          raw: res?.raw,
        };
        setApiResult(result);
        if (res?.winnerLabel) {
          setGreenRatio(result.greenRatio);
        }
      })
      .catch(() => {
        if (!cancelled) setApiResult({ greenRatio: greenRatioProp ?? 0.68 });
      });

    return () => {
      cancelled = true;
    };
  }, [open, onRun, variants, greenRatioProp]);

  useEffect(() => {
    if (cinemaDone && (apiResult || phase === "running")) {
      setPhase("done");
      onFinished?.(apiResult ?? { greenRatio });
    }
  }, [cinemaDone, apiResult, greenRatio, onFinished, phase]);

  const handleCinemaComplete = useCallback(() => {
    setCinemaDone(true);
  }, []);

  if (!open) return null;

  const winner = apiResult?.winnerLabel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 md:p-8">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="w-full max-w-5xl h-full max-h-[90vh] flex flex-col gap-4">
        <AgentCinemaVerdict
          taskTitle={taskTitle}
          taskSubtitle={taskSubtitle ?? `${variants.length} variants · ${variants.map((v) => v.label).join(" vs ")}`}
          greenRatio={greenRatio}
          minDurationMs={cinemaMinDurationMs()}
          onComplete={handleCinemaComplete}
        />

        {phase === "done" && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center sm:text-left">
              <p className="text-sm text-muted-foreground">Agent panel verdict</p>
              <p className="text-xl font-semibold text-white">
                {winner ? (
                  <>
                    Ship <span className="text-primary">Variant {winner}</span>
                  </>
                ) : (
                  "Evaluation complete"
                )}
              </p>
            </div>
            <Button onClick={onClose} size="lg">
              <FileText className="h-4 w-4" /> View report
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
