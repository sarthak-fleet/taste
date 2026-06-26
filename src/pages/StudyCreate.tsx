import { useMutation } from '@tanstack/react-query';
import { Plus, Rocket, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AgentEvaluationOverlay } from '@/components/AgentEvaluationOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, DEMO_WORKSPACE_ID } from '@/lib/api';
import { resultFromLaunchResponse } from '@/lib/evaluationOverlay';
import { METRICS, OBJECTIVES, STUDY_TYPES } from '@/lib/types';

interface VariantDraft {
  id: string;
  name: string;
  label: string;
  description: string;
  hypothesis: string;
  assetUrl: string;
}

const LABELS = ['A', 'B', 'C', 'D', 'E'];

export default function StudyCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [studyType, setStudyType] = useState('landing_page');
  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [targetUserRole, setTargetUserRole] = useState('');
  const [targetUserDescription, setTargetUserDescription] = useState('');
  const [primaryObjective, setPrimaryObjective] = useState('maximize_signup');
  const [primaryMetric, setPrimaryMetric] = useState('conversion_intent');
  const [contextQuestions, setContextQuestions] = useState('');
  const [contextConcerns, setContextConcerns] = useState('');
  const [showEvalOverlay, setShowEvalOverlay] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([
    {
      id: crypto.randomUUID(),
      name: '',
      label: 'A',
      description: '',
      hypothesis: '',
      assetUrl: '',
    },
    {
      id: crypto.randomUUID(),
      name: '',
      label: 'B',
      description: '',
      hypothesis: '',
      assetUrl: '',
    },
  ]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createStudy({
        workspaceId: DEMO_WORKSPACE_ID,
        name,
        studyType,
        productName,
        productUrl,
        productDescription,
        targetUserRole,
        targetUserDescription,
        primaryObjective,
        primaryMetric,
        contextQuestions,
        contextConcerns,
        variants: variants.map((v) => ({
          name: v.name,
          label: v.label,
          description: v.description,
          hypothesis: v.hypothesis,
          assetType: 'url',
          assetUrl: v.assetUrl,
        })),
      }),
    onSuccess: (data) => {
      toast.success('Study created');
      navigate(`/studies/${data.study.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const launchStudyIdRef = useRef('');

  function handleLaunchClick() {
    setShowEvalOverlay(true);
  }

  async function runLaunchEvaluation() {
    const created = await api.createStudy({
      workspaceId: DEMO_WORKSPACE_ID,
      name,
      studyType,
      productName,
      productUrl,
      productDescription,
      targetUserRole,
      targetUserDescription,
      primaryObjective,
      primaryMetric,
      contextQuestions,
      contextConcerns,
      variants: variants.map((v) => ({
        name: v.name,
        label: v.label,
        description: v.description,
        hypothesis: v.hypothesis,
        assetType: 'url',
        assetUrl: v.assetUrl,
      })),
    });
    const launched = await api.launchStudy(created.study.id);
    launchStudyIdRef.current = created.study.id;
    const variantsWithIds = created.variants;
    return resultFromLaunchResponse({ ...launched, variants: variantsWithIds });
  }

  function handleOverlayClose() {
    setShowEvalOverlay(false);
    if (launchStudyIdRef.current) {
      navigate(`/studies/${launchStudyIdRef.current}/report`);
    }
  }

  function addVariant() {
    if (variants.length >= 5) return;
    setVariants([
      ...variants,
      {
        id: crypto.randomUUID(),
        name: '',
        label: LABELS[variants.length]!,
        description: '',
        hypothesis: '',
        assetUrl: '',
      },
    ]);
  }

  function removeVariant(i: number) {
    if (variants.length <= 2) return;
    setVariants(
      variants.filter((_, idx) => idx !== i).map((v, idx) => ({ ...v, label: LABELS[idx]! }))
    );
  }

  function updateVariant(i: number, field: keyof VariantDraft, value: string) {
    setVariants(variants.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));
  }

  const steps = ['Product', 'Decision', 'Variants', 'Review'];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Create study</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Define your product decision. ShipRank will evaluate variants and return a ranked
        recommendation.
      </p>

      <div className="flex gap-2 mb-8">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={`flex-1 py-2 text-sm rounded-md border transition-colors ${
              step === i
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Product context</CardTitle>
            <CardDescription>What product are you making a decision about?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Study name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Devtool onboarding v2"
              />
            </div>
            <div>
              <Label>Product name</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="DeployWatch"
              />
            </div>
            <div>
              <Label>Product URL</Label>
              <Input
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>One-line description</Label>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="A deployment monitoring tool for backend teams"
              />
            </div>
            <Button onClick={() => setStep(1)} disabled={!name}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Decision objective</CardTitle>
            <CardDescription>What are you trying to optimize?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Study type</Label>
              <Select value={studyType} onValueChange={setStudyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target user role</Label>
              <Input
                value={targetUserRole}
                onChange={(e) => setTargetUserRole(e.target.value)}
                placeholder="Backend engineer at a SaaS startup"
              />
            </div>
            <div>
              <Label>Target user description</Label>
              <Textarea
                value={targetUserDescription}
                onChange={(e) => setTargetUserDescription(e.target.value)}
                placeholder="Technical, self-serve, evaluates tools quickly..."
              />
            </div>
            <div>
              <Label>Primary objective</Label>
              <Select value={primaryObjective} onValueChange={setPrimaryObjective}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary metric</Label>
              <Select value={primaryMetric} onValueChange={setPrimaryMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Key questions / concerns</Label>
              <Textarea
                value={contextQuestions}
                onChange={(e) => setContextQuestions(e.target.value)}
                placeholder="Which variant gets users to complete setup fastest?"
              />
            </div>
            <div>
              <Label>Known concerns</Label>
              <Textarea
                value={contextConcerns}
                onChange={(e) => setContextConcerns(e.target.value)}
                placeholder="Variant B may be too technical for managers..."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!targetUserRole}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <CardDescription>
              Add 2–5 variants to compare. URLs or descriptions work for MVP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {variants.map((v, i) => (
              <div key={v.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">Variant {v.label}</span>
                  {variants.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeVariant(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input
                  value={v.name}
                  onChange={(e) => updateVariant(i, 'name', e.target.value)}
                  placeholder="Code-first onboarding"
                />
                <Input
                  value={v.assetUrl}
                  onChange={(e) => updateVariant(i, 'assetUrl', e.target.value)}
                  placeholder="https://prototype.example.com/variant-b"
                />
                <Textarea
                  value={v.description}
                  onChange={(e) => updateVariant(i, 'description', e.target.value)}
                  placeholder="Brief description of this variant"
                />
                <Input
                  value={v.hypothesis}
                  onChange={(e) => updateVariant(i, 'hypothesis', e.target.value)}
                  placeholder="Hypothesis: developers prefer seeing setup code immediately"
                />
              </div>
            ))}
            {variants.length < 5 && (
              <Button variant="outline" onClick={addVariant}>
                <Plus className="h-4 w-4" /> Add variant
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={variants.some((v) => !v.name)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & launch</CardTitle>
            <CardDescription>
              Launching runs the AI agent panel across all variants and generates your decision
              report. Human validation can be added later from the study page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Study</dt>
              <dd>{name}</dd>
              <dt className="text-muted-foreground">Product</dt>
              <dd>{productName || '—'}</dd>
              <dt className="text-muted-foreground">Target user</dt>
              <dd>{targetUserRole}</dd>
              <dt className="text-muted-foreground">Variants</dt>
              <dd>{variants.length}</dd>
            </dl>
            <ul className="text-sm space-y-1 border-t border-border pt-4">
              {variants.map((v) => (
                <li key={v.label}>
                  <span className="text-primary font-medium">{v.label}:</span> {v.name}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                variant="secondary"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !name || variants.some((v) => !v.name)}
              >
                Save as draft
              </Button>
              <Button
                onClick={handleLaunchClick}
                disabled={
                  showEvalOverlay || !name || !targetUserRole || variants.some((v) => !v.name)
                }
              >
                <Rocket className="h-4 w-4" />
                Launch study
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AgentEvaluationOverlay
        open={showEvalOverlay}
        taskTitle={name || 'Variant evaluation'}
        taskSubtitle={productName ? `${productName} · ${targetUserRole}` : targetUserRole}
        variants={variants.map((v) => ({ label: v.label, name: v.name }))}
        onRun={runLaunchEvaluation}
        onClose={handleOverlayClose}
      />
    </div>
  );
}
