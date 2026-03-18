import { API_BASE_URL } from './client';

export interface TaskArtifact {
  id: string;
  taskId: string;
  projectId: string;
  agentId?: string;
  filename: string;
  title: string;
  fileType: 'markdown' | 'html' | 'csv' | 'text';
  size?: number;
  createdAt?: string;
  /** Only present when fetching full artifact */
  content?: string;
}

export async function listTaskArtifacts(
  userId: string,
  projectId: string,
  taskId: string
): Promise<TaskArtifact[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load artifacts');
  }

  const data = await response.json();
  return data.artifacts || [];
}

export async function getTaskArtifact(
  userId: string,
  projectId: string,
  taskId: string,
  artifactId: string
): Promise<TaskArtifact> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load artifact');
  }

  return response.json();
}
