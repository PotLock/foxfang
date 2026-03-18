import { API_BASE_URL } from './client';

export type IdeaType = 'note' | 'article' | 'quote' | 'image';

export interface Idea {
  id: string;
  projectId?: string;
  title: string;
  content: string;
  type: IdeaType;
  tags: string[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function listIdeas(params: {
  userId: string;
  projectId?: string;
  type?: string;
  tag?: string;
  search?: string;
  limit?: number;
}): Promise<Idea[]> {
  const query = new URLSearchParams({ userId: params.userId });
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.type) query.set('type', params.type);
  if (params.tag) query.set('tag', params.tag);
  if (params.search) query.set('search', params.search);
  if (params.limit) query.set('limit', String(params.limit));

  const response = await fetch(`${API_BASE_URL}/ideas?${query}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load ideas');
  }

  const data = await response.json();
  return data.ideas || [];
}

export async function createIdea(input: {
  userId: string;
  title: string;
  content: string;
  type?: IdeaType;
  tags?: string[];
  sourceUrl?: string;
  projectId?: string;
}): Promise<Idea> {
  const response = await fetch(`${API_BASE_URL}/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to create idea');
  }

  const data = await response.json();
  return data.idea;
}

export async function updateIdea(input: {
  userId: string;
  ideaId: string;
  title?: string;
  content?: string;
  type?: IdeaType;
  tags?: string[];
  sourceUrl?: string | null;
  projectId?: string | null;
}): Promise<Idea> {
  const response = await fetch(`${API_BASE_URL}/ideas/${encodeURIComponent(input.ideaId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      title: input.title,
      content: input.content,
      type: input.type,
      tags: input.tags,
      sourceUrl: input.sourceUrl,
      projectId: input.projectId
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to update idea');
  }

  const data = await response.json();
  return data.idea;
}

export async function deleteIdea(userId: string, ideaId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/ideas/${encodeURIComponent(ideaId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to delete idea');
  }
}
