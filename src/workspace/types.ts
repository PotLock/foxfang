// src/workspace/types.ts
// Workspace file types and interfaces

export interface WorkspaceFile {
  name: string;
  content: string;
  lastModified: Date;
  category: 'identity' | 'memory' | 'protocol' | 'user';
}

export interface WorkspaceConfig {
  workspaceDir: string;
  userId: string;
  projectId?: string;
  agentId?: string;
}

export interface IdentityData {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  tone?: string;
}

export interface UserData {
  name: string;
  email: string;
  timezone?: string;
  language?: string;
  preferences?: Record<string, any>;
}

export interface SoulData {
  personality: string;
  values: string[];
  boundaries: string[];
  communicationStyle: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: 'core' | 'daily' | 'conversation' | 'custom';
  sessionId?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}
