import { parseReplyControls } from '../agents/governance';
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

function normalizeComparableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInternalPlaceholderReply(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized === '[tool invocation]' ||
    normalized === '[tool results]' ||
    normalized.startsWith('[tool results]')
  );
}

function sanitizeVisibleText(raw: string, currentMessageId: string): string {
  const parsed = parseReplyControls(raw, { currentMessageId });
  const visible = String(parsed.content || '').trim();
  if (!visible) return '';
  if (isInternalPlaceholderReply(visible)) return '';
  return visible;
}

export function createReplyProjector(options: ReplyProjectorOptions): ReplyProjector {
  let finalized = false;
  let quoteConsumed = false;
  let lastProjectedVisibleText = '';
  let partialReplySent = false;
  let finalContent = '';
  let finalToolCalls: ToolCall[] | undefined;
  const seenProjectionSignatures = new Set<string>();
  const allMediaUrls: string[] = [];
  const sentMediaUrls = new Set<string>();

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
    if (partialReplySent) return false;

    const visible = sanitizeVisibleText(text, options.currentMessageId);
    if (!visible) return false;
    if (isProgressOnlyStatusUpdate(visible)) return false;

    const signature = normalizeComparableText(visible);
    if (!signature || seenProjectionSignatures.has(signature)) return false;
    seenProjectionSignatures.add(signature);

    const sent = options.dispatcher.sendBlockReply(buildPayload({
      text: visible,
      allowDefaultReplyQuote: true,
    }));
    if (sent) {
      partialReplySent = true;
      lastProjectedVisibleText = visible;
    }
    return sent;
  };

  const consume = async (chunk: StreamChunk): Promise<void> => {
    if (finalized) return;

    if (chunk.type === 'assistant_update') {
      enqueuePartialReply(chunk.content || '');
      return;
    }

    if (chunk.type === 'tool_call') {
      return;
    }

    if (chunk.type === 'tool_result') {
      rememberMediaUrls(chunk.mediaUrls);
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
    const sanitizedParsedContent = isInternalPlaceholderReply(parsedContentRaw)
      ? ''
      : parsedContentRaw;
    const rawIsInternalPlaceholder = isInternalPlaceholderReply(rawFinalContent);
    const mediaUrl = selectUnsentMediaUrl();
    const fallbackTextFromRaw =
      !sanitizedParsedContent &&
      mediaUrl &&
      rawFinalContent &&
      !rawIsInternalPlaceholder
        ? rawFinalContent
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
      Boolean(lastProjectedVisibleText) &&
      normalizeComparableText(lastProjectedVisibleText) === normalizedFinal;

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
