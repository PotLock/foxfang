import { API_BASE_URL } from './client';

export interface CampaignStep {
  id: string;
  name: string;
  agentRole: string;
  prompt: string;
  requiresArtifact: boolean;
  selfReview: boolean;
  autoAdvanceThreshold?: number;
  dependsOn?: string[];
}

export interface CampaignTemplate {
  id: string;
  projectId?: string | null;
  name: string;
  description?: string;
  steps: CampaignStep[];
  schedule?: string;
  autoApproveThreshold: number;
  maxRetries: number;
  triggerOnNewIdea: boolean;
  status: 'active' | 'paused' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface StepResult {
  id: string;
  runId: string;
  stepId: string;
  agentId?: string;
  taskId?: string;
  status: 'pending' | 'running' | 'self_review' | 'waiting_approval' | 'approved' | 'rejected' | 'retrying' | 'failed';
  selfReviewScore?: number;
  selfReviewReasoning?: string;
  retryCount: number;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CampaignRun {
  id: string;
  projectId?: string | null;
  templateId: string;
  status: 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  currentStep?: string;
  context: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  triggerType: 'manual' | 'cron' | 'idea' | 'webhook';
  triggerPayload?: Record<string, unknown>;
  stepResults?: StepResult[];
  template?: CampaignTemplate;
}

// ── User-level Campaign Templates API ──────────────────────

export async function listCampaignTemplates(
  userId: string
): Promise<CampaignTemplate[]> {
  const response = await fetch(
    `${API_BASE_URL}/campaign-templates?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load templates');
  }

  const data = await response.json();
  return data.templates || [];
}

export async function getBuiltInTemplates(
  userId: string
): Promise<CampaignTemplate[]> {
  const response = await fetch(
    `${API_BASE_URL}/campaign-templates/built-in`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load built-in templates');
  }

  const data = await response.json();
  return data.templates || [];
}

export async function createCampaignTemplate(
  userId: string,
  template: Omit<CampaignTemplate, 'id' | 'createdAt' | 'updatedAt'> & { projectId?: string }
): Promise<CampaignTemplate> {
  const response = await fetch(
    `${API_BASE_URL}/campaign-templates`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        projectId: template.projectId || undefined,
        name: template.name,
        description: template.description,
        steps: template.steps,
        schedule: template.schedule,
        autoApproveThreshold: template.autoApproveThreshold,
        maxRetries: template.maxRetries,
        triggerOnNewIdea: template.triggerOnNewIdea
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to create template');
  }

  const data = await response.json();
  return data.template;
}

export async function updateCampaignTemplate(
  userId: string,
  templateId: string,
  updates: Partial<Omit<CampaignTemplate, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<CampaignTemplate> {
  const response = await fetch(
    `${API_BASE_URL}/campaign-templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        projectId: updates.projectId,
        name: updates.name,
        description: updates.description,
        steps: updates.steps,
        schedule: updates.schedule,
        autoApproveThreshold: updates.autoApproveThreshold,
        maxRetries: updates.maxRetries,
        triggerOnNewIdea: updates.triggerOnNewIdea,
        status: updates.status
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to update template');
  }

  const data = await response.json();
  return data.template;
}

export async function deleteCampaignTemplate(
  userId: string,
  templateId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/campaign-templates/${encodeURIComponent(templateId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to delete template');
  }
}

// ── User-level Campaign Runs API ───────────────────────────

export async function listCampaignRuns(
  userId: string,
  status?: string
): Promise<CampaignRun[]> {
  const query = new URLSearchParams({ userId });
  if (status) query.set('status', status);

  const response = await fetch(
    `${API_BASE_URL}/campaigns?${query}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load campaigns');
  }

  const data = await response.json();
  return data.runs || [];
}

export async function getCampaignRun(
  userId: string,
  runId: string
): Promise<CampaignRun> {
  const response = await fetch(
    `${API_BASE_URL}/campaigns/${encodeURIComponent(runId)}?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load campaign');
  }

  const data = await response.json();
  return data.run;
}

export async function startCampaign(
  userId: string,
  templateId: string,
  initialContext?: Record<string, unknown>
): Promise<CampaignRun> {
  const response = await fetch(
    `${API_BASE_URL}/campaigns/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        templateId,
        initialContext
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to start campaign');
  }

  const data = await response.json();
  return data.run;
}

export async function resolveStep(
  userId: string,
  runId: string,
  stepId: string,
  decision: 'approve' | 'reject',
  notes?: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/campaigns/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        decision,
        notes
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to resolve step');
  }
}

export async function batchApproveSteps(
  userId: string,
  stepIds: Array<{ runId: string; stepId: string }>,
  decision: 'approve' | 'reject',
  notes?: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/campaigns/batch-approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        stepIds,
        decision,
        notes
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to batch approve');
  }
}
