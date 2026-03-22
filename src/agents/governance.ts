/**
 * Runtime governance primitives shared across agent/runtime/channel layers.
 */

export const SILENT_REPLY_TOKEN = '[[silent_reply]]';
export const HEARTBEAT_ACK_TOKEN = 'HEARTBEAT_OK';
export const REPLY_TO_CURRENT_TAG = '[[reply_to_current]]';

export type ParsedReplyControls = {
  content: string;
  suppress: boolean;
  replyToMessageId?: string;
  reason?: 'silent' | 'heartbeat_ack' | 'empty';
};

type ParseOptions = {
  currentMessageId?: string;
};

function trimLeadingControlTags(raw: string): {
  content: string;
  replyToCurrent: boolean;
  replyToMessageId?: string;
} {
  let content = raw.trim();
  let replyToCurrent = false;
  let replyToMessageId: string | undefined;

  // Allow multiple leading tags; parse in-order and stop at first non-tag token.
  while (true) {
    const currentMatch = content.match(/^\[\[\s*reply_to_current\s*\]\]\s*/i);
    if (currentMatch) {
      replyToCurrent = true;
      content = content.slice(currentMatch[0].length).trimStart();
      continue;
    }

    const explicitMatch = content.match(/^\[\[\s*reply_to\s*:\s*([^\]\n]+?)\s*\]\]\s*/i);
    if (explicitMatch) {
      const parsed = explicitMatch[1]?.trim();
      if (parsed) replyToMessageId = parsed;
      content = content.slice(explicitMatch[0].length).trimStart();
      continue;
    }
    break;
  }

  return { content: content.trim(), replyToCurrent, replyToMessageId };
}

export function parseReplyControls(rawContent: string, options: ParseOptions = {}): ParsedReplyControls {
  const raw = (rawContent || '').trim();
  if (!raw) {
    return {
      content: '',
      suppress: true,
      reason: 'empty',
    };
  }

  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized === SILENT_REPLY_TOKEN) {
    return {
      content: '',
      suppress: true,
      reason: 'silent',
    };
  }

  if (/^HEARTBEAT_OK[.!]?$/i.test(normalized)) {
    return {
      content: '',
      suppress: true,
      reason: 'heartbeat_ack',
    };
  }

  const trimmed = trimLeadingControlTags(raw);
  const content = trimmed.content.trim();
  const replyToMessageId = trimmed.replyToMessageId
    || (trimmed.replyToCurrent ? options.currentMessageId : undefined);

  if (!content) {
    return {
      content: '',
      suppress: true,
      reason: 'empty',
      ...(replyToMessageId ? { replyToMessageId } : {}),
    };
  }

  return {
    content,
    suppress: false,
    ...(replyToMessageId ? { replyToMessageId } : {}),
  };
}
