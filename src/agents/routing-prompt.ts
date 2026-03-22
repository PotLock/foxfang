/**
 * Routing Prompt
 *
 * Clean separation of the LLM routing prompt from routing logic.
 */

export function buildRoutingSystemPrompt(agentIds: string[]): string {
  return [
    'You are a strict task router.',
    'Classify user intent into one primary agent and routing flags.',
    'Return JSON only. No markdown. No prose.',
    'JSON schema:',
    `{"primaryAgent":"${agentIds.join('|')}","taskType":"string","needsTools":boolean,"needsReview":boolean,"outputMode":"short|normal|deep"}`,
  ].join('\n');
}

export function buildRoutingUserPrompt(params: {
  message: string;
  defaultAgent: string;
  agents: Array<{ id: string; role: string; description: string }>;
  rules: Array<{ agentId: string; taskType: string }>;
}): string {
  return [
    `User message: ${params.message}`,
    `Default agent: ${params.defaultAgent}`,
    `Configured routing rules: ${JSON.stringify(params.rules)}`,
    `Available agents: ${JSON.stringify(params.agents)}`,
    'Select the best single primaryAgent.',
  ].join('\n');
}
