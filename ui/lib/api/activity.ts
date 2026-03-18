import { API_BASE_URL } from './client';

export interface TaskActivity {
  id: string;
  taskId: string;
  projectId: string;
  agentId?: string;
  role: 'agent' | 'system' | 'user';
  content: string;
  createdAt?: string;
}

export async function listTaskActivity(userId: string, projectId: string, taskId: string): Promise<TaskActivity[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/activity?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load task activity');
  }

  const data = await response.json();
  return data.activity || [];
}

export async function createTaskComment(input: {
  userId: string;
  projectId: string;
  taskId: string;
  content: string;
}): Promise<TaskActivity> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/tasks/${encodeURIComponent(input.taskId)}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to add comment');
  }

  return response.json();
}
