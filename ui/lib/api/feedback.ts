import { API_BASE_URL } from './client';

export interface Feedback {
  id: string;
  projectId: string;
  contentId: string;
  reviewer?: string;
  score: number;
  notes?: string;
  createdAt?: string;
}

export async function submitArtifactFeedback(input: {
  userId: string;
  projectId: string;
  artifactId: string;
  score: number;
  notes?: string;
  reviewer?: string;
}): Promise<Feedback> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/artifacts/${encodeURIComponent(input.artifactId)}/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.userId,
        score: input.score,
        notes: input.notes,
        reviewer: input.reviewer
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to submit feedback');
  }

  return response.json();
}

export async function listArtifactFeedback(
  userId: string,
  projectId: string,
  artifactId: string
): Promise<Feedback[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/feedback?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load feedback');
  }

  const data = await response.json();
  return data.feedback || [];
}
