import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function studyStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_review: "Pending review",
    evaluating: "Evaluating",
    generating_report: "Generating report",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function recommendationLabel(rec: string): string {
  const labels: Record<string, string> = {
    ship: "Ship",
    borrow: "Borrow elements",
    test: "A/B test",
    kill: "Do not ship",
  };
  return labels[rec] ?? rec;
}

export function generateStudyBrief(study: {
  name: string;
  productName?: string;
  productDescription?: string;
  targetUserRole?: string;
  targetUserDescription?: string;
  primaryObjective?: string;
  primaryMetric?: string;
  contextQuestions?: string;
  contextConcerns?: string;
  variants?: Array<{ label: string; name: string; hypothesis?: string }>;
}): string {
  const lines = [
    `Study: ${study.name}`,
    "",
    "Product:",
    study.productName ?? "(not specified)",
    study.productDescription ? study.productDescription : "",
    "",
    "Target user:",
    study.targetUserRole ?? "(not specified)",
    study.targetUserDescription ?? "",
    "",
    "Decision:",
    `Choose the variant most likely to improve ${study.primaryObjective?.replace(/_/g, " ") ?? "the primary objective"}.`,
    "",
    "Primary metric:",
    study.primaryMetric?.replace(/_/g, " ") ?? "(not specified)",
    "",
  ];

  if (study.variants?.length) {
    lines.push("Variants:");
    for (const v of study.variants) {
      lines.push(`${v.label}: ${v.name}${v.hypothesis ? ` — ${v.hypothesis}` : ""}`);
    }
    lines.push("");
  }

  if (study.contextQuestions) {
    lines.push("Key questions:");
    lines.push(study.contextQuestions);
    lines.push("");
  }

  if (study.contextConcerns) {
    lines.push("Known concerns:");
    lines.push(study.contextConcerns);
  }

  return lines.filter((l) => l !== undefined).join("\n");
}
