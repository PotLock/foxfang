import { API_BASE_URL } from './client';

export interface Project {
  id: string;
  name: string;
  description?: string;
  hasBrand?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function listProjects(userId: string): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/projects?userId=${encodeURIComponent(userId)}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load projects');
  }

  const data = await response.json();
  return data.projects || [];
}

export interface BrandProfileInput {
  name?: string;
  tagline?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontPrimary?: string;
  fontSecondary?: string;
  toneKeywords?: string[];
  targetAudience?: string;
}

export async function createProject(input: {
  userId: string;
  userEmail: string;
  userName?: string;
  avatarUrl?: string;
  name: string;
  description?: string;
  /** Raw text content of the brand document (BRAND.md). If provided, all agents in this project will be initialised with brand context. */
  brandContent?: string;
  /** Structured brand profile. If provided, a BRAND.md will be auto-generated. */
  brandProfile?: BrandProfileInput;
}): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to create project');
  }

  const data = await response.json();
  return data.project;
}

export interface WebsiteAnalysisResult {
  name: string | null;
  tagline: string | null;
  description: string | null;
  toneAdjectives: string[];
  targetAudience: string | null;
  brandColors: string[];
  typography: string | null;
  brandDocument: string | null;
}

export async function analyzeWebsite(userId: string, url: string): Promise<WebsiteAnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/projects/analyze-website`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, url })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || 'Failed to analyze website');
  }

  const data = await response.json();
  return data.brand;
}

export async function updateProject(input: {
  userId: string;
  projectId: string;
  name?: string;
  description?: string | null;
}): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/projects/${input.projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: input.userId, name: input.name, description: input.description })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to update project');
  }

  const data = await response.json();
  return data.project;
}

export async function deleteProject(input: {
  userId: string;
  projectId: string;
}): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${input.projectId}?userId=${encodeURIComponent(input.userId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to delete project');
  }
}

/** Upload or replace the brand document for an existing project.
 *  All agents in the project will have their SOUL.md, IDENTITY.md, and BRAND.md rewritten.
 */
export async function uploadProjectBrand(input: {
  userId: string;
  projectId: string;
  brandContent: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${input.projectId}/brand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: input.userId, brandContent: input.brandContent })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to upload brand');
  }
}
