/**
 * FoxFang Update Tools
 *
 * foxfang_update_status — read-only git check (behind/ahead).
 * foxfang_update        — runs git pull main, rebuilds, then gracefully
 *                         restarts the daemon via sentinel + process-respawn.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolCategory, ToolResult } from '../traits';
import { UPDATE_BRANCH, UPDATE_REMOTE, UPSTREAM_REPO } from '../../infra/update-channels';
import { runUpdate } from '../../infra/update-runner';
import { writeRestartSentinel } from '../../infra/restart-sentinel';
import { scheduleRespawnAndExit } from '../../infra/process-respawn';

const execAsync = promisify(exec);
const TIMEOUT_MS = 30_000;

async function git(cmd: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd, timeout: TIMEOUT_MS });
  return stdout.trim();
}

export class FoxFangUpdateStatusTool implements Tool {
  name = 'foxfang_update_status';
  description =
    'Check whether FoxFang has updates available on the main branch. ' +
    'Returns current commit SHA, remote commit SHA, and how many commits are behind. ' +
    'Use this to inform the user before suggesting they run /update.';
  category = ToolCategory.UTILITY;

  parameters = {
    type: 'object' as const,
    properties: {},
    required: [],
  };

  async execute(): Promise<ToolResult> {
    const cwd = process.cwd();

    try {
      // Fetch silently so we have up-to-date remote refs
      await execAsync(`git fetch ${UPDATE_REMOTE} ${UPDATE_BRANCH}`, {
        cwd,
        timeout: TIMEOUT_MS,
      }).catch(() => null); // non-fatal — we still report local state

      const [localSha, remoteSha, branch, behindRaw, aheadRaw] = await Promise.all([
        git('git rev-parse HEAD', cwd).catch(() => null),
        git(`git rev-parse ${UPDATE_REMOTE}/${UPDATE_BRANCH}`, cwd).catch(() => null),
        git('git rev-parse --abbrev-ref HEAD', cwd).catch(() => null),
        git(`git rev-list --count HEAD..${UPDATE_REMOTE}/${UPDATE_BRANCH}`, cwd).catch(() => '0'),
        git(`git rev-list --count ${UPDATE_REMOTE}/${UPDATE_BRANCH}..HEAD`, cwd).catch(() => '0'),
      ]);

      const behind = parseInt(behindRaw ?? '0', 10);
      const ahead = parseInt(aheadRaw ?? '0', 10);
      const upToDate = behind === 0;

      let status: string;
      if (upToDate && ahead === 0) {
        status = 'up-to-date';
      } else if (behind > 0) {
        status = `${behind} commit${behind === 1 ? '' : 's'} behind — update available`;
      } else {
        status = `${ahead} local commit${ahead === 1 ? '' : 's'} ahead of remote`;
      }

      const output = [
        `Repository: ${UPSTREAM_REPO}`,
        `Branch: ${branch ?? 'unknown'} → ${UPDATE_REMOTE}/${UPDATE_BRANCH}`,
        `Local:  ${localSha ? localSha.slice(0, 8) : 'unknown'}`,
        `Remote: ${remoteSha ? remoteSha.slice(0, 8) : 'unknown'}`,
        `Status: ${status}`,
        '',
        upToDate
          ? 'FoxFang is up to date.'
          : `FoxFang has ${behind} update${behind === 1 ? '' : 's'} available. Ask the user if they want to update with /update.`,
      ].join('\n');

      return {
        success: true,
        output,
        data: {
          localSha,
          remoteSha,
          branch,
          behind,
          ahead,
          upToDate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: 'Could not check update status — not a git repository or no network.',
      };
    }
  }
}

export class FoxFangUpdateTool implements Tool {
  name = 'foxfang_update';
  description =
    'Update FoxFang to the latest version from the main branch. ' +
    'Runs git pull, rebuilds, then restarts the daemon. ' +
    'IMPORTANT: pass channel and chat_id from the current conversation so the user ' +
    'receives a confirmation message after the daemon restarts. ' +
    'Call foxfang_update_status first if you are unsure whether an update is needed.';
  category = ToolCategory.UTILITY;

  parameters = {
    type: 'object' as const,
    properties: {
      channel: {
        type: 'string',
        description: 'The channel the user is messaging on (e.g. telegram, discord, slack, signal). Pass the current channel.',
      },
      chat_id: {
        type: 'string',
        description: 'The chat or user ID to notify after restart. Pass the current chat id.',
      },
      thread_id: {
        type: 'string',
        description: 'Optional thread or topic ID for threaded channels.',
      },
    },
    required: ['channel', 'chat_id'],
  };

  async execute(args: {
    channel: string;
    chat_id: string;
    thread_id?: string;
  }): Promise<ToolResult> {
    const result = await runUpdate();

    if (result.status === 'skipped') {
      return {
        success: false,
        output: `Update skipped: ${result.reason}. ${result.reason === 'uncommitted-changes' ? 'There are uncommitted local changes.' : ''}`,
        data: result,
      };
    }

    if (result.status !== 'ok') {
      const failedStep = result.steps.find(s => s.exitCode !== 0);
      const detail = failedStep?.stderrTail
        ? `\n${failedStep.stderrTail.split('\n').slice(0, 3).join('\n')}`
        : '';
      return {
        success: false,
        output: `Update failed at step "${result.reason}".${detail}`,
        data: result,
      };
    }

    // Write sentinel so the restarted daemon notifies the user
    await writeRestartSentinel({
      channel: args.channel,
      chatId: args.chat_id,
      threadId: args.thread_id,
      message: '✅ FoxFang updated successfully. I\'m back online!',
      triggeredAt: Date.now(),
    });

    // Spawn detached restart script and exit — this never returns
    return await scheduleRespawnAndExit();
  }
}
