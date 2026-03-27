import {
  isInternalToolPlaceholderText,
  parseReplyControls,
  sanitizeReplyTextContent,
} from '../agents/governance';
import type { StreamChunk, ToolCall } from '../agents/types';
import { isProgressOnlyStatusUpdate } from '../agents/runtime';
import type { ReplyDispatcher } from './dispatcher';
import type { ReplyPayload } from './types';

export interface ReplyProjectionResult {
  content?: string;
  toolCalls?: ToolCall[];
  mediaUrls?: string[];
}

export interface ReplyProjector {
  consume: (chunk: StreamChunk) => Promise<void>;
  finalize: () => Promise<ReplyProjectionResult>;
}

interface ReplyProjectorOptions {
  dispatcher: ReplyDispatcher;
  currentMessageId: string;
  defaultReplyToMessageId?: string;
  threadId?: string;
}

const MAX_PARTIAL_REPLIES = 2;
const MIN_PARTIAL_REPLY_CHARS = 80;
const MAX_PARTIAL_REPLY_CHARS = 520;
const MAX_TOOL_STATUS_REPLIES = 4;
const TOOL_STATUS_COOLDOWN_MS = 1_200;
const MAX_TOOL_DETAIL_CHARS = 140;

function normalizeComparableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInternalPlaceholderReply(value: string): boolean {
  return isInternalToolPlaceholderText(value);
}

function sanitizeVisibleText(raw: string, currentMessageId: string): string {
  const parsed = parseReplyControls(raw, { currentMessageId });
  const visible = sanitizeReplyTextContent(String(parsed.content || '').trim());
  if (!visible) return '';
  if (isInternalPlaceholderReply(visible)) return '';
  return visible;
}

function truncateAtNaturalBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const boundary = Math.max(
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  if (boundary >= Math.max(80, Math.floor(maxChars * 0.5))) {
    return slice.slice(0, boundary + 1).trim();
  }
  return `${slice.trim()}...`;
}

function selectProjectableVisibleText(raw: string, currentMessageId: string): string {
  const visible = sanitizeVisibleText(raw, currentMessageId);
  if (!visible) return '';
  const normalizedWhitespace = visible.replace(/\n{3,}/g, '\n\n').trim();
  const paragraphs = normalizedWhitespace
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  let candidate = normalizedWhitespace;
  if (paragraphs.length >= 2 && normalizedWhitespace.length > MAX_PARTIAL_REPLY_CHARS) {
    candidate = `${paragraphs[0]}\n\n${paragraphs[1]}`.trim();
  } else if (paragraphs.length >= 1 && normalizedWhitespace.length > MAX_PARTIAL_REPLY_CHARS) {
    candidate = paragraphs[0];
  }

  return truncateAtNaturalBoundary(candidate, MAX_PARTIAL_REPLY_CHARS);
}

function compactInlineText(value: string, maxChars: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function toToolLabel(tool?: string): string {
  const normalized = String(tool || '').trim();
  if (!normalized) return 'tool';
  return normalized;
}

function extractToolHint(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const source = args as Record<string, unknown>;
  const preferredKeys = ['url', 'path', 'query', 'q', 'action', 'location', 'ticker'];
  for (const key of preferredKeys) {
    const raw = source[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    return compactInlineText(trimmed, 48);
  }
  return undefined;
}

function extractToolResultSummary(result: unknown): string | undefined {
  const isLowValueSummary = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return ['ok', 'success', 'completed', 'done', 'true'].includes(normalized);
  };

  if (!result) return undefined;
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed || isLowValueSummary(trimmed)) return undefined;
    return compactInlineText(trimmed, MAX_TOOL_DETAIL_CHARS);
  }
  if (typeof result !== 'object') {
    return undefined;
  }

  const source = result as Record<string, unknown>;
  const preferredKeys = ['summary', 'message', 'title', 'status'];
  for (const key of preferredKeys) {
    const raw = source[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || isLowValueSummary(trimmed)) continue;
    return compactInlineText(trimmed, MAX_TOOL_DETAIL_CHARS);
  }

  if (source.data && typeof source.data === 'object') {
    const nested = extractToolResultSummary(source.data);
    if (nested) return nested;
  }
  if (typeof source.data === 'string') {
    const trimmed = source.data.trim();
    if (trimmed && !isLowValueSummary(trimmed)) {
      return compactInlineText(trimmed, MAX_TOOL_DETAIL_CHARS);
    }
  }
  return undefined;
}

export function createReplyProjector(options: ReplyProjectorOptions): ReplyProjector {
  let finalized = false;
  let quoteConsumed = false;
  let lastProjectedVisibleText = '';
  let partialRepliesSent = 0;
  let toolStatusRepliesSent = 0;
  let lastToolStatusAt = 0;
  let finalContent = '';
  let finalToolCalls: ToolCall[] | undefined;
  const seenProjectionSignatures = new Set<string>();
  const allMediaUrls: string[] = [];
  const sentMediaUrls = new Set<string>();
  const seenToolStatusSignatures = new Set<string>();

  const rememberMediaUrls = (urls?: string[]): void => {
    for (const mediaUrl of urls || []) {
      const trimmed = String(mediaUrl || '').trim();
      if (!trimmed || allMediaUrls.includes(trimmed)) continue;
      allMediaUrls.push(trimmed);
    }
  };

  const takeReplyToMessageId = (allowDefaultReplyQuote: boolean, explicitReplyToMessageId?: string): string | undefined => {
    if (explicitReplyToMessageId) {
      return explicitReplyToMessageId;
    }
    if (!allowDefaultReplyQuote || quoteConsumed || !options.defaultReplyToMessageId) {
      return undefined;
    }
    quoteConsumed = true;
    return options.defaultReplyToMessageId;
  };

  const buildPayload = (params: {
    text?: string;
    mediaUrl?: string;
    explicitReplyToMessageId?: string;
    allowDefaultReplyQuote?: boolean;
  }): ReplyPayload => {
    const payload: ReplyPayload = {
      threadId: options.threadId,
    };

    const text = String(params.text || '').trim();
    const mediaUrl = String(params.mediaUrl || '').trim();
    if (text) payload.text = text;
    if (mediaUrl) payload.mediaUrl = mediaUrl;

    const replyToMessageId = takeReplyToMessageId(
      params.allowDefaultReplyQuote === true,
      params.explicitReplyToMessageId,
    );
    if (replyToMessageId) payload.replyToMessageId = replyToMessageId;

    return payload;
  };

  const selectUnsentMediaUrl = (): string | undefined => {
    for (const mediaUrl of allMediaUrls) {
      if (sentMediaUrls.has(mediaUrl)) continue;
      sentMediaUrls.add(mediaUrl);
      return mediaUrl;
    }
    return undefined;
  };

  const enqueuePartialReply = (text: string): boolean => {
    if (partialRepliesSent >= MAX_PARTIAL_REPLIES) return false;

    const visible = selectProjectableVisibleText(text, options.currentMessageId);
    if (!visible) return false;
    if (isProgressOnlyStatusUpdate(visible)) return false;
    if (visible.length < MIN_PARTIAL_REPLY_CHARS && !visible.includes('\n')) return false;

    const signature = normalizeComparableText(visible);
    if (!signature || seenProjectionSignatures.has(signature)) return false;
    seenProjectionSignatures.add(signature);

    const sent = options.dispatcher.sendBlockReply(buildPayload({
      text: visible,
      allowDefaultReplyQuote: true,
    }));
    if (sent) {
      partialRepliesSent += 1;
      lastProjectedVisibleText = visible;
    }
    return sent;
  };

  const enqueueToolStatus = (text: string, force = false): boolean => {
    const visible = sanitizeVisibleText(text, options.currentMessageId);
    if (!visible) return false;
    if (!force && toolStatusRepliesSent >= MAX_TOOL_STATUS_REPLIES) return false;

    const signature = normalizeComparableText(visible);
    if (!signature || seenToolStatusSignatures.has(signature)) return false;

    const now = Date.now();
    if (!force && now - lastToolStatusAt < TOOL_STATUS_COOLDOWN_MS) {
      return false;
    }

    const sent = options.dispatcher.sendToolResult(buildPayload({
      text: visible,
      allowDefaultReplyQuote: true,
    }));
    if (!sent) return false;

    seenToolStatusSignatures.add(signature);
    toolStatusRepliesSent += 1;
    lastToolStatusAt = now;
    return true;
  };

  const formatToolCallStatus = (chunk: StreamChunk): string => {
    const label = toToolLabel(chunk.tool);
    const hint = extractToolHint(chunk.args);
    if (hint) {
      return `🔧 Running ${label}: ${hint}`;
    }
    return `🔧 Running ${label}...`;
  };

  const formatToolResultStatus = (chunk: StreamChunk): string | undefined => {
    const label = toToolLabel(chunk.tool);
    if (chunk.error) {
      const detail = compactInlineText(String(chunk.error || ''), MAX_TOOL_DETAIL_CHARS);
      return detail ? `⚠️ ${label} failed: ${detail}` : `⚠️ ${label} failed.`;
    }
    const summary = extractToolResultSummary(chunk.result);
    if (!summary) return undefined;
    return `✅ ${label}: ${summary}`;
  };

  const consume = async (chunk: StreamChunk): Promise<void> => {
    if (finalized) return;

    if (chunk.type === 'assistant_update') {
      enqueuePartialReply(chunk.content || '');
      return;
    }

    if (chunk.type === 'tool_call') {
      enqueueToolStatus(formatToolCallStatus(chunk));
      return;
    }

    if (chunk.type === 'tool_result') {
      rememberMediaUrls(chunk.mediaUrls);
      const resultStatus = formatToolResultStatus(chunk);
      if (resultStatus) {
        enqueueToolStatus(resultStatus, Boolean(chunk.error));
      }
      return;
    }

    if (chunk.type === 'done') {
      finalized = true;
      finalToolCalls = chunk.toolCalls;
      rememberMediaUrls(chunk.mediaUrls);
      finalContent = String(chunk.finalContent || '').trim();
      return;
    }
  };

  const finalize = async (): Promise<ReplyProjectionResult> => {
    const rawFinalContent = String(finalContent || '').trim();
    const parsedReply = parseReplyControls(rawFinalContent, {
      currentMessageId: options.currentMessageId,
    });
    const parsedContentRaw = String(parsedReply.content || '').trim();
    const sanitizedParsedContent = sanitizeReplyTextContent(parsedContentRaw);
    const sanitizedRawFinalContent = sanitizeReplyTextContent(rawFinalContent);
    const rawIsInternalPlaceholder = isInternalPlaceholderReply(rawFinalContent);
    const mediaUrl = selectUnsentMediaUrl();
    const fallbackTextFromRaw =
      !sanitizedParsedContent &&
      mediaUrl &&
      sanitizedRawFinalContent &&
      !rawIsInternalPlaceholder
        ? sanitizedRawFinalContent
        : '';
    const mediaOnlyFallbackText =
      !sanitizedParsedContent && !fallbackTextFromRaw && mediaUrl
        ? 'Partial result attached.'
        : '';
    const placeholderOnlyFallbackText =
      !sanitizedParsedContent && !fallbackTextFromRaw && !mediaUrl
        ? lastProjectedVisibleText
        : '';
    const visibleFinalText =
      sanitizedParsedContent
      || fallbackTextFromRaw
      || mediaOnlyFallbackText
      || placeholderOnlyFallbackText;

    const normalizedFinal = normalizeComparableText(visibleFinalText);
    const shouldSuppressFinal =
      Boolean(parsedReply.suppress) && !mediaUrl;
    const isDuplicateFinal =
      Boolean(visibleFinalText) &&
      !mediaUrl &&
      Boolean(normalizedFinal) &&
      seenProjectionSignatures.has(normalizedFinal);

    if (!shouldSuppressFinal && (visibleFinalText || mediaUrl) && !isDuplicateFinal) {
      options.dispatcher.sendFinalReply(buildPayload({
        text: visibleFinalText,
        mediaUrl,
        explicitReplyToMessageId: parsedReply.replyToMessageId,
        allowDefaultReplyQuote: true,
      }));
    }

    return {
      content: visibleFinalText || lastProjectedVisibleText || undefined,
      toolCalls: finalToolCalls,
      mediaUrls: allMediaUrls.length > 0 ? allMediaUrls : undefined,
    };
  };

  return {
    consume,
    finalize,
  };
}
