/**
 * Secrets Management
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const SECRETS_DIR = join(homedir(), '.foxfang', 'secrets');
const SECRETS_FILE = join(SECRETS_DIR, 'secrets.enc');

export interface Secret {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export class SecretsManager {
  private masterKey?: Buffer;
  private secrets: Map<string, Secret> = new Map();
  private initialized = false;

  async initialize(password?: string): Promise<void> {
    if (this.initialized) return;

    await mkdir(SECRETS_DIR, { recursive: true });

    if (password) {
      this.masterKey = scryptSync(password, 'foxfang-salt', 32);
    }

    if (existsSync(SECRETS_FILE)) {
      await this.load();
    }

    this.initialized = true;
  }

  async set(key: string, value: string): Promise<void> {
    this.ensureInitialized();
    
    const now = new Date().toISOString();
    const existing = this.secrets.get(key);
    
    this.secrets.set(key, {
      key,
      value,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    
    await this.save();
  }

  async get(key: string): Promise<string | undefined> {
    this.ensureInitialized();
    return this.secrets.get(key)?.value;
  }

  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();
    const deleted = this.secrets.delete(key);
    if (deleted) await this.save();
    return deleted;
  }

  async list(): Promise<string[]> {
    this.ensureInitialized();
    return Array.from(this.secrets.keys());
  }

  async exists(key: string): Promise<boolean> {
    this.ensureInitialized();
    return this.secrets.has(key);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecretsManager not initialized');
    }
  }

  private async load(): Promise<void> {
    if (!this.masterKey) {
      // Unencrypted load for development
      const data = await readFile(SECRETS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.secrets = new Map(Object.entries(parsed));
      return;
    }

    // Encrypted load
    const encrypted = await readFile(SECRETS_FILE);
    const iv = encrypted.slice(0, 16);
    const content = encrypted.slice(16);

    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    
    const parsed = JSON.parse(decrypted.toString());
    this.secrets = new Map(Object.entries(parsed));
  }

  private async save(): Promise<void> {
    const data = JSON.stringify(Object.fromEntries(this.secrets));

    if (!this.masterKey) {
      // Unencrypted save for development
      await writeFile(SECRETS_FILE, data);
      return;
    }

    // Encrypted save
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    await writeFile(SECRETS_FILE, Buffer.concat([iv, encrypted]));
  }
}

// Singleton instance
let secretsManager: SecretsManager | null = null;

export async function getSecretsManager(): Promise<SecretsManager> {
  if (!secretsManager) {
    secretsManager = new SecretsManager();
    await secretsManager.initialize();
  }
  return secretsManager;
}
