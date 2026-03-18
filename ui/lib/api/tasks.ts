import { API_BASE_URL } from './client';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  labels: string[];
  assigneeId?: string;
  reporterId?: string;
  taskId?: string;
  dueDate?: string;
  startDate?: string;
  cronExpression?: string;
  isRecurring?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function listTasks(userId: string, projectId: string): Promise<Task[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/tasks?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load tasks');
  }

  const data = await response.json();
  return data.tasks || [];
}

export async function createTask(input: {
  userId: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  labels: string[];
  assigneeId?: string;
  reporterId?: string;
  taskId?: string;
  dueDate?: string;
  startDate?: string;
}): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to create task');
  }

  const data = await response.json();
  return data.task;
}

export async function updateTask(input: {
  userId: string;
  projectId: string;
  taskId: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  labels?: string[];
  assigneeId?: string | null;
  reporterId?: string | null;
  taskCode?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  cronExpression?: string | null;
  isRecurring?: boolean;
}): Promise<Task> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/tasks/${encodeURIComponent(input.taskId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to update task');
  }

  const data = await response.json();
  return data.task;
}

export async function deleteTask(input: {
  userId: string;
  projectId: string;
  taskId: string;
}): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/tasks/${encodeURIComponent(input.taskId)}?userId=${encodeURIComponent(input.userId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to delete task');
  }
}
