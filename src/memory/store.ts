/**
 * Memory Store
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const MEMORY_DIR = join(homedir(), '.foxfang', 'memory');
const MEMORY_FILE = join(MEMORY_DIR, 'memories.json');

export interface Memory {
  id: string;
  type: string;
  title?: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MemorySearchResult extends Memory {
  score: number;
}

export interface MemoryConfig {
  enabled: boolean;
  vectorStore?: string;
}

export class MemoryStore {
  private config: MemoryConfig;
  private memories: Map<string, Memory> = new Map();
  private initialized = false;

  constructor(config: MemoryConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await mkdir(MEMORY_DIR, { recursive: true });
    
    if (existsSync(MEMORY_FILE)) {
      await this.load();
    }
    
    this.initialized = true;
  }

  async add(memory: Omit<Memory, 'id'>): Promise<string> {
    this.ensureInitialized();
    
    const id = randomUUID();
    const fullMemory: Memory = { ...memory, id };
    
    this.memories.set(id, fullMemory);
    await this.save();
    
    return id;
  }

  async get(id: string): Promise<Memory | undefined> {
    this.ensureInitialized();
    return this.memories.get(id);
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();
    this.memories.delete(id);
    await this.save();
  }

  async list(options: { type?: string; limit?: number } = {}): Promise<Memory[]> {
    this.ensureInitialized();
    
    let memories = Array.from(this.memories.values());
    
    if (options.type) {
      memories = memories.filter(m => m.type === options.type);
    }
    
    memories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }
    
    return memories;
  }

  async search(query: string, options: { type?: string; limit?: number } = {}): Promise<MemorySearchResult[]> {
    this.ensureInitialized();
    
    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];
    
    for (const memory of this.memories.values()) {
      if (options.type && memory.type !== options.type) continue;
      
      const contentLower = memory.content.toLowerCase();
      const titleLower = memory.title?.toLowerCase() || '';
      
      // Simple text-based scoring
      let score = 0;
      if (contentLower.includes(queryLower)) score += 0.5;
      if (titleLower.includes(queryLower)) score += 0.3;
      
      // Word matching
      const queryWords = queryLower.split(/\s+/);
      const contentWords = contentLower.split(/\s+/);
      const matches = queryWords.filter(qw => contentWords.some(cw => cw.includes(qw))).length;
      score += (matches / queryWords.length) * 0.2;
      
      if (score > 0) {
        results.push({ ...memory, score });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    
    if (options.limit) {
      return results.slice(0, options.limit);
    }
    
    return results;
  }

  async getStats(): Promise<{ total: number; byType: Record<string, number>; storageSize: number }> {
    this.ensureInitialized();
    
    const total = this.memories.size;
    const byType: Record<string, number> = {};
    
    for (const memory of this.memories.values()) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
    }
    
    // Estimate storage size
    const data = JSON.stringify(Array.from(this.memories.values()));
    const storageSize = Buffer.byteLength(data, 'utf8');
    
    return { total, byType, storageSize };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryStore not initialized');
    }
  }

  private async load(): Promise<void> {
    try {
      const content = await readFile(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(content) as Memory[];
      this.memories = new Map(parsed.map(m => [m.id, m]));
    } catch {
      this.memories = new Map();
    }
  }

  private async save(): Promise<void> {
    const data = Array.from(this.memories.values());
    await writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
  }
}
