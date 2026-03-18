// src/security/policy.ts

export interface PolicyViolation {
  reason: string;
  risk: 'low' | 'medium' | 'high';
  evidence?: string;
}

const INJECTION_PATTERNS = [
  /ignore (all|previous) instructions/i,
  /system prompt/i,
  /developer message/i,
  /override (rules|policy)/i,
  /reveal (hidden|secret)/i
];

export class SecurityPolicy {
  checkPromptInjection(input: string): PolicyViolation | null {
    for (const pattern of INJECTION_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        return {
          reason: 'Potential prompt injection attempt',
          risk: 'medium',
          evidence: match[0]
        };
      }
    }

    return null;
  }
}

