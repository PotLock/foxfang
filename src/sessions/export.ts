/**
 * Session Export
 */

import { writeFile } from 'fs/promises';
import { Session } from './manager';

export async function exportSession(session: Session, filePath: string, format: 'json' | 'markdown'): Promise<void> {
  if (format === 'json') {
    await writeFile(filePath, JSON.stringify(session, null, 2));
  } else if (format === 'markdown') {
    const markdown = sessionToMarkdown(session);
    await writeFile(filePath, markdown);
  }
}

function sessionToMarkdown(session: Session): string {
  const lines: string[] = [];
  
  lines.push(`# Session: ${session.id}`);
  lines.push('');
  lines.push(`**Agent:** ${session.agentId}`);
  lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`**Last Active:** ${new Date(session.lastActive).toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  for (const message of session.messages) {
    const role = message.role === 'user' ? 'User' : 'Assistant';
    lines.push(`## ${role}`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
    lines.push(`*${new Date(message.timestamp).toLocaleString()}*`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}
