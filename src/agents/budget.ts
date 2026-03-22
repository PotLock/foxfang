import { ReasoningMode, TokenBudget } from './types';

function modeMultiplier(mode: ReasoningMode): number {
  if (mode === 'fast') return 0.8;
  if (mode === 'deep') return 1.35;
  return 1;
}

export function resolveTokenBudget(params: {
  agentId: string;
  mode?: ReasoningMode;
}): TokenBudget {
  const mode = params.mode || 'balanced';
  const mult = modeMultiplier(mode);

  const baseByProfile: Record<'orchestrator' | 'specialist' | 'reviewer', Omit<TokenBudget, 'remainingInputTokens' | 'remainingOutputTokens'>> = {
    orchestrator: {
      requestMaxInputTokens: 800,
      requestMaxOutputTokens: 450,
      maxToolIterations: 2,
      maxDelegations: 1,
      maxReviewPasses: 0,
    },
    specialist: {
      requestMaxInputTokens: 2500,
      requestMaxOutputTokens: 1400,
      maxToolIterations: 5,
      maxDelegations: 0,
      maxReviewPasses: 1,
    },
    reviewer: {
      requestMaxInputTokens: 1200,
      requestMaxOutputTokens: 800,
      maxToolIterations: 3,
      maxDelegations: 0,
      maxReviewPasses: 1,
    },
  };

  const normalizedAgentId = (params.agentId || '').toLowerCase();
  const profile = normalizedAgentId === 'orchestrator'
    ? 'orchestrator'
    : /(review|reviewer|analyst|analysis|audit|qa|quality|critic)/i.test(normalizedAgentId)
      ? 'reviewer'
      : 'specialist';

  const base = baseByProfile[profile];

  const requestMaxInputTokens = Math.floor(base.requestMaxInputTokens * mult);
  const requestMaxOutputTokens = Math.floor(base.requestMaxOutputTokens * mult);

  return {
    ...base,
    requestMaxInputTokens,
    requestMaxOutputTokens,
    remainingInputTokens: requestMaxInputTokens,
    remainingOutputTokens: requestMaxOutputTokens,
  };
}

function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimMessagesToBudget<T extends { role: string; content: string }>(
  messages: T[],
  maxInputTokens: number,
) {
  const kept: T[] = [];
  let used = 0;

  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const msg = messages[idx];
    const tokens = estimateTokensFromText(msg.content);
    if (used + tokens > maxInputTokens) {
      continue;
    }
    used += tokens;
    kept.unshift(msg);
  }

  return {
    messages: kept,
    usedTokens: used,
  };
}
