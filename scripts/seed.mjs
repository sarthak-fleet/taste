/**
 * Seeds local D1 database via wrangler.
 * Run: pnpm db:migrate:local && pnpm db:seed
 */
import { execSync } from 'node:child_process';

const workspaceId = 'ws-demo-001';
const now = new Date().toISOString();

const agents = [
  [
    'ag-ux',
    'ux_clarity',
    'UX Clarity Agent',
    'Evaluates layout hierarchy and next-action clarity.',
    'ux_clarity',
  ],
  [
    'ag-skeptic',
    'skeptical_buyer',
    'Skeptical Target User',
    'Challenges value prop and trust signals.',
    'skeptical_buyer',
  ],
  [
    'ag-conv',
    'conversion_funnel',
    'Conversion / Funnel Agent',
    'Analyzes CTA strength and signup intent.',
    'conversion',
  ],
  [
    'ag-tech',
    'technical_user',
    'Technical User Agent',
    'Developer credibility and setup clarity.',
    'technical',
  ],
  [
    'ag-copy',
    'copy_critic',
    'Copy Critic Agent',
    'Headline strength and messaging specificity.',
    'copy',
  ],
  [
    'ag-a11y',
    'accessibility_basics',
    'Accessibility / Basics Agent',
    'Readability and layout basics.',
    'accessibility',
  ],
];

const battleId = 'battle-001';
const battleSlug = 'devtool-landing-showdown';

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

const statements = [
  `INSERT OR IGNORE INTO workspaces (id, name, slug, owner_email, created_at) VALUES ('${workspaceId}', 'Demo Workspace', 'demo', 'founder@demo.dev', '${now}');`,
  ...agents.map(
    ([id, slug, name, desc, type]) =>
      `INSERT OR IGNORE INTO agent_profiles (id, slug, name, description, agent_type, prompt_version, status, created_at) VALUES ('${id}', '${slug}', '${sqlEscape(name)}', '${sqlEscape(desc)}', '${type}', 'v1', 'active', '${now}');`
  ),
  `INSERT OR IGNORE INTO arena_battles (id, slug, title, description, goal, variant_a_id, variant_b_id, variant_a_json, variant_b_json, winning_variant_id, status, reveal_at, created_at) VALUES (
    '${battleId}',
    '${battleSlug}',
    'Devtool landing page showdown',
    'Two positioning strategies for a deployment monitoring tool. Which converts better for backend engineers?',
    'maximize_signup',
    'a',
    'b',
    '{"name":"Speed-first hero","description":"Leads with real-time alerts and sub-second detection. Headline: Catch outages before your users do.","previewColor":"#1e3a5f","highlights":["Real-time alerts","Sub-second detection","Zero config setup"]}',
    '{"name":"Trust-first hero","description":"Leads with enterprise logos, SOC2 badge, and case studies. Headline: The monitoring platform teams trust.","previewColor":"#2d1f3d","highlights":["SOC2 certified","Used by 500+ teams","99.99% uptime SLA"]}',
    'b',
    'revealed',
    '${now}',
    '${now}'
  );`,
];

for (const stmt of statements) {
  try {
    execSync(`wrangler d1 execute shiprank-db --local --command "${stmt.replace(/"/g, '\\"')}"`, {
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Seed statement failed:', stmt.slice(0, 80));
    throw e;
  }
}

console.log('Seed complete.');
console.log(`Workspace ID: ${workspaceId}`);
console.log(`Arena battle: /arena/${battleSlug}`);
