import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function EvaluatorApply() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    industry: "",
    seniority: "",
    evaluatorType: "target_user",
    skills: "",
  });

  const mutation = useMutation({
    mutationFn: () => api.applyEvaluator(form),
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Application submitted");
    },
    onError: (e) => toast.error(e.message),
  });

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Application received</h1>
        <p className="text-muted-foreground">
          We&apos;ll review your profile and reach out when matched studies are available.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Become an evaluator</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Join the judgment network. Get paid for structured product evaluations. Build reputation
        for accurate predictions.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluator application</CardTitle>
          <CardDescription>We&apos;re recruiting SaaS/devtool target users, PMs, designers, and founders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Backend engineer, Growth PM, etc."
            />
          </div>
          <div>
            <Label>Evaluator type</Label>
            <Select value={form.evaluatorType} onValueChange={(v) => setForm({ ...form, evaluatorType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="target_user">Target user</SelectItem>
                <SelectItem value="domain_expert">Domain expert</SelectItem>
                <SelectItem value="buyer">Buyer persona</SelectItem>
                <SelectItem value="power_user">Power user</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="SaaS, devtools, AI tools" />
          </div>
          <div>
            <Label>Seniority</Label>
            <Input value={form.seniority} onChange={(e) => setForm({ ...form, seniority: e.target.value })} placeholder="5 years" />
          </div>
          <div>
            <Label>Tools / skills</Label>
            <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, Kubernetes, Figma..." />
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.email || !form.role || mutation.isPending}
            className="w-full"
          >
            Submit application
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
