import assert from 'node:assert/strict';
import test from 'node:test';
import type { StreamChunk } from '../src/agents/types';
import { createReplyProjector } from '../src/auto-reply/reply-projector';
import type { ReplyDispatcher, ReplyDispatchKind } from '../src/auto-reply/dispatcher';
import type { ReplyPayload } from '../src/auto-reply/types';

type SentReply = {
  kind: ReplyDispatchKind;
  payload: ReplyPayload;
};

function createDispatcher(sent: SentReply[]): ReplyDispatcher {
  const enqueue = (kind: ReplyDispatchKind, payload: ReplyPayload): boolean => {
    sent.push({ kind, payload });
    return true;
  };

  return {
    sendToolResult: (payload) => enqueue('tool', payload),
    sendBlockReply: (payload) => enqueue('block', payload),
    sendFinalReply: (payload) => enqueue('final', payload),
    waitForIdle: async () => {},
    getQueuedCounts: () => ({ tool: 0, block: 0, final: 0 }),
    markComplete: () => {},
  };
}

test('projects tool call updates via sendToolResult', async () => {
  const sent: SentReply[] = [];
  const projector = createReplyProjector({
    dispatcher: createDispatcher(sent),
    currentMessageId: 'm-1',
    defaultReplyToMessageId: 'm-1',
  });

  const chunk: StreamChunk = {
    type: 'tool_call',
    tool: 'fetch_url',
    args: { url: 'https://reply.cash/docs' },
  };
  await projector.consume(chunk);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.kind, 'tool');
  assert.match(sent[0]?.payload.text || '', /Running fetch_url/i);
});

test('projects tool errors immediately even during cooldown', async () => {
  const sent: SentReply[] = [];
  const projector = createReplyProjector({
    dispatcher: createDispatcher(sent),
    currentMessageId: 'm-2',
    defaultReplyToMessageId: 'm-2',
  });

  await projector.consume({
    type: 'tool_call',
    tool: 'browser',
    args: { action: 'open' },
  });
  await projector.consume({
    type: 'tool_result',
    tool: 'browser',
    error: 'Failed to launch Chrome',
    result: { error: 'Failed to launch Chrome' },
  });

  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.kind, 'tool');
  assert.match(sent[1]?.payload.text || '', /failed/i);
});

test('allows shorter assistant_update partial replies and still sends final', async () => {
  const sent: SentReply[] = [];
  const projector = createReplyProjector({
    dispatcher: createDispatcher(sent),
    currentMessageId: 'm-3',
    defaultReplyToMessageId: 'm-3',
  });

  await projector.consume({
    type: 'assistant_update',
    content:
      'I am reading the Google Sheets file and will summarize the main findings into a short report.',
  });
  await projector.consume({
    type: 'done',
    finalContent: 'Done reading. Here is the summary of the survey results.',
  });

  const result = await projector.finalize();
  assert.equal(result.content, 'Done reading. Here is the summary of the survey results.');

  const blockReplies = sent.filter((entry) => entry.kind === 'block');
  const finalReplies = sent.filter((entry) => entry.kind === 'final');
  assert.equal(blockReplies.length, 1);
  assert.equal(finalReplies.length, 1);
});
