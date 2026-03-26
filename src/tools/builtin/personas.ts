/**
 * Personas Tool
 *
 * Fetch marketing personas from a URL and save to a scoped personas file.
 * Reply Cash personas should not be mixed with unrelated contexts.
 *
 * Default source: https://marketing.reply.cash
 * Override via argument or config.
 */

import { Tool, ToolCategory } from '../traits';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import { homedir } from 'os';

const DEFAULT_PERSONAS_URL = 'https://marketing.reply.cash';

function getWorkspacePath(): string {
  return join(homedir(), '.foxfang', 'workspace', 'presets');
}

function resolveOutputFileName(args: { filename?: string; scope?: string }): string {
  const customFilename = String(args.filename || '').trim();
  if (customFilename) return basename(customFilename);

  const scope = String(args.scope || 'reply-cash').trim().toLowerCase();
  if (scope === 'reply-cash' || scope === 'replycash') {
    return 'PERSONAS_REPLY_CASH.md';
  }

  return 'AUDIENCE_PERSONAS.md';
}

/**
 * Strip HTML tags and decode common entities for plain-text extraction.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h([1-6])[^>]*>/gi, (_m, level) => '#'.repeat(Number(level)) + ' ')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Personas Sync Tool
 * Fetches personas from a URL, extracts content, saves as a scoped personas markdown file.
 */
export class PersonasSyncTool implements Tool {
  name = 'personas_sync';
  description = 'Fetch personas from a URL and save to a scoped workspace personas file (default: PERSONAS_REPLY_CASH.md).';
  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: `URL to fetch personas from (default: ${DEFAULT_PERSONAS_URL})`,
      },
      format: {
        type: 'string',
        description: 'Expected content format: "html" (auto-convert) or "markdown" (save as-is). Default: auto-detect.',
      },
      scope: {
        type: 'string',
        description: 'Personas scope: "reply-cash" (default) or "generic".',
      },
      filename: {
        type: 'string',
        description: 'Optional output filename (overrides scope default).',
      },
    },
    required: [],
  };

  async execute(args: {
    url?: string;
    format?: 'html' | 'markdown';
    scope?: 'reply-cash' | 'generic' | string;
    filename?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    const url = args.url || DEFAULT_PERSONAS_URL;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html, text/markdown, text/plain, application/json',
          'User-Agent': 'FoxFang/1.0',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch personas: ${response.status} ${response.statusText}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const rawBody = await response.text();

      let content: string;
      const isHtml = args.format === 'html' || (!args.format && contentType.includes('text/html'));

      if (isHtml) {
        content = htmlToText(rawBody);
      } else {
        // Markdown or plain text — use as-is
        content = rawBody;
      }

      if (!content.trim()) {
        return { success: false, error: 'Fetched content is empty after processing.' };
      }

      const outputFile = resolveOutputFileName(args);

      // Build personas markdown
      const personasContent = `# Marketing Personas

> Auto-synced from ${url}
> Last updated: ${new Date().toISOString()}
> Scope: ${String(args.scope || 'reply-cash')}
> File: ${outputFile}

${content}
`;

      // Write to workspace
      const workspacePath = getWorkspacePath();
      if (!existsSync(workspacePath)) {
        mkdirSync(workspacePath, { recursive: true });
      }

      const filePath = join(workspacePath, outputFile);
      writeFileSync(filePath, personasContent, 'utf-8');

      return {
        success: true,
        data: {
          source: url,
          savedTo: filePath,
          contentLength: content.length,
          preview: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync personas',
      };
    }
  }
}
