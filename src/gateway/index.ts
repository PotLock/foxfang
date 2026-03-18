/**
 * API Gateway
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { AgentOrchestrator } from '../agents/orchestrator';

interface GatewayConfig {
  port?: number;
  host?: string;
  enableCors?: boolean;
  allowedOrigins?: string[];
}

export class Gateway {
  private app: Application;
  private port: number;
  private host: string;
  private server: ReturnType<Application['listen']> | null = null;
  private orchestrator: AgentOrchestrator;

  constructor(orchestrator: AgentOrchestrator, config: GatewayConfig = {}) {
    this.orchestrator = orchestrator;
    this.port = config.port || 3000;
    this.host = config.host || 'localhost';
    this.app = express();
    this.setupMiddleware(config);
    this.setupRoutes();
  }

  private setupMiddleware(config: GatewayConfig): void {
    if (config.enableCors !== false) {
      this.app.use(cors({
        origin: config.allowedOrigins || '*',
      }));
    }
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Chat endpoint
    this.app.post('/api/v1/chat', async (req: Request, res: Response) => {
      const { message, projectId, sessionId } = req.body;
      const response = await this.orchestrator.process({
        query: message,
        projectId,
        sessionId,
      });
      res.json({ response: response.content });
    });

    // Webhooks for channels
    this.app.post('/webhooks/telegram', (req: Request, res: Response) => {
      res.json({ ok: true });
    });

    this.app.post('/webhooks/discord', (req: Request, res: Response) => {
      res.json({ ok: true });
    });

    this.app.post('/webhooks/slack', (req: Request, res: Response) => {
      res.json({ ok: true });
    });

    this.app.post('/webhooks/signal', (req: Request, res: Response) => {
      res.json({ ok: true });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`Gateway listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}
