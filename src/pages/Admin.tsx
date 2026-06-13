import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Shield, BarChart3, Users, Swords } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, studyStatusLabel } from "@/lib/utils";

export default function Admin() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.getAdminOverview(),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading admin...</div>;
  if (error) return <div className="p-8 text-destructive">Admin API unavailable</div>;

  const { stats, recentStudies } = data!;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-8">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Admin</h1>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={BarChart3} label="Total studies" value={stats.totalStudies} />
        <StatCard icon={BarChart3} label="Completed" value={stats.completed} />
        <StatCard icon={Users} label="Evaluators" value={stats.evaluators} />
        <StatCard icon={Swords} label="Arena battles" value={stats.arenaBattles} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent studies</CardTitle>
          <CardDescription>Review, assign evaluators, edit reports before delivery</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentStudies.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <Link to={`/studies/${s.id}`} className="font-medium hover:text-primary">
                    {s.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{studyStatusLabel(s.status)}</Badge>
                  {s.status === "completed" && (
                    <Link to={`/studies/${s.id}/report`} className="text-xs text-primary hover:underline">
                      Report
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {recentStudies.length === 0 && (
              <p className="text-sm text-muted-foreground">No studies yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">MVP operations checklist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>✓ Agent evaluation pipeline (mock agents, structured output)</p>
          <p>✓ Simulated human panel on launch (7 evaluators)</p>
          <p>✓ Report generation with ranking + evidence</p>
          <p>○ Manual evaluator recruitment (use /evaluators/apply)</p>
          <p>○ Report editing before delivery (API: PATCH /admin/reports/:studyId)</p>
          <p>○ Outcome follow-up after customer ships</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="h-8 w-8 text-primary/60" />
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
