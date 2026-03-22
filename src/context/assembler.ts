import { AgentHandoff, OutputSpec } from '../agents/types';

export type AssembledContext = {
  systemAddendum: string;
  sessionSummary: string;
  recentMessages: string[];
  handoff: AgentHandoff;
  snippets: string[];
  memories: string[];
  outputSpec: OutputSpec;
};

function buildAddendum(params: {
  agentId: string;
  taskType: string;
  outputSpec: OutputSpec;
}): string {
  const agentHint = params.agentId.toLowerCase();
  const taskType = params.taskType.toLowerCase();
  const looksLikeReviewer = /(review|analyst|audit|qa|quality|critic)/i.test(`${agentHint} ${taskType}`);
  const looksLikeStrategist = params.outputSpec.format === 'plan' || /(strategy|planner|plan|campaign)/i.test(`${agentHint} ${taskType}`);

  if (looksLikeReviewer) {
    return [
      'Return concise, structured critique focused on objective and constraints.',
      'Avoid full rewrites unless explicitly required.',
    ].join('\n');
  }

  if (looksLikeStrategist) {
    return [
      'Prioritize audience insights, positioning, and practical sequencing.',
      'Use concise rationale for each recommendation.',
    ].join('\n');
  }

  return [
    'Prioritize strong hook, clarity, and brand voice consistency.',
    'Keep writing specific and concrete; avoid generic filler.',
    'Do not fabricate metrics, outcomes, or proof points not present in provided facts.',
    'For rewrite requests, return final copy only without commentary wrappers.',
  ].join('\n');
}

export function assembleContext(params: {
  agentId: string;
  sessionSummary: string;
  recentMessages: string[];
  handoff: AgentHandoff;
  snippets: string[];
  memories: string[];
  outputSpec: OutputSpec;
}): AssembledContext {
  return {
    systemAddendum: buildAddendum({
      agentId: params.agentId,
      taskType: params.handoff.taskGoal,
      outputSpec: params.outputSpec,
    }),
    sessionSummary: params.sessionSummary,
    recentMessages: params.recentMessages.slice(-4),
    handoff: params.handoff,
    snippets: params.snippets.slice(0, 3),
    memories: params.memories.slice(0, 5),
    outputSpec: params.outputSpec,
  };
}
