import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustToolsForIntent, isProgressOnlyStatusUpdate } from '../src/agents/runtime';
import type { AgentContext } from '../src/agents/types';

function createContext(message: string): AgentContext {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
    messages: [
      {
        role: 'user',
        content: message,
        timestamp: new Date(),
      },
    ],
    tools: [],
  };
}

test('isProgressOnlyStatusUpdate detects browser progress-only replies', () => {
  assert.equal(
    isProgressOnlyStatusUpdate(
      'I can see the page loaded but I need to scroll down to the footer. Let me continue scrolling to find the footer section with chain assets and providers:',
    ),
    true,
  );
  assert.equal(
    isProgressOnlyStatusUpdate('Footer lists chain assets: ETH, BTC. Providers: Alchemy, Infura.'),
    false,
  );
});

test('adjustToolsForIntent promotes agent_browser for visual page tasks', () => {
  const tools = [
    { name: 'fetch_url', description: 'fetch', parameters: {} },
    { name: 'firecrawl_scrape', description: 'scrape', parameters: {} },
    { name: 'agent_browser', description: 'browser', parameters: {} },
    { name: 'web_search', description: 'search', parameters: {} },
  ];

  const adjusted = adjustToolsForIntent(
    createContext('Go to the footer of reply.cash and see chain assets and providers'),
    tools,
  );

  assert.deepEqual(
    adjusted.map((tool) => tool.name),
    ['agent_browser', 'web_search', 'fetch_url', 'firecrawl_scrape'],
  );
});

test('adjustToolsForIntent leaves non-visual research tasks unchanged', () => {
  const tools = [
    { name: 'web_search', description: 'search', parameters: {} },
    { name: 'fetch_url', description: 'fetch', parameters: {} },
    { name: 'agent_browser', description: 'browser', parameters: {} },
  ];

  const adjusted = adjustToolsForIntent(
    createContext('Research competitors of reply.cash and summarize their pricing'),
    tools,
  );

  assert.deepEqual(
    adjusted.map((tool) => tool.name),
    ['web_search', 'fetch_url', 'agent_browser'],
  );
});
