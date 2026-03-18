'use client';

import {
  FileText, Search, Twitter, TrendingUp, BarChart3, Brain,
  MessageSquare, Lightbulb, Rocket, Users, Palette, Globe,
  Zap, Database, Bot, Shield
} from 'lucide-react';

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  category: string;
  badge?: string;
}

const features: Feature[] = [
  // AI Agents
  {
    icon: Bot,
    title: 'AI Marketing Agents',
    description: 'Autonomous agents that handle content creation, analysis, and optimization. Agents use tools to complete tasks with full traceability.',
    category: 'Core',
  },
  {
    icon: MessageSquare,
    title: 'Real-time Chat',
    description: 'Chat with AI agents via streaming responses. Agents can access tools, memory, and your brand context to give relevant answers.',
    category: 'Core',
  },
  {
    icon: Database,
    title: 'Project Memory',
    description: 'Per-project persistent memory with brand isolation. Agents learn from feedback and maintain context across sessions.',
    category: 'Core',
  },

  // Content & Ideas
  {
    icon: Lightbulb,
    title: 'Ideas Inbox',
    description: 'Capture inspiration — notes, articles, quotes, images. Tag and organize ideas, then use them as input for campaigns.',
    category: 'Content',
  },
  {
    icon: Rocket,
    title: 'Campaign Pipelines',
    description: 'Multi-step campaign workflows with self-review and auto-approval thresholds. Define templates and run them on schedule or on-demand.',
    category: 'Content',
  },
  {
    icon: Palette,
    title: 'Brand Profiles',
    description: 'Define brand identity per project — colors, fonts, tone keywords, target audience. Agents use this to maintain consistent voice.',
    category: 'Content',
  },

  // Twitter / X Tools
  {
    icon: Twitter,
    title: 'Twitter Post',
    description: 'Post tweets directly from agents. Connect your Twitter account via OAuth — no API key needed. Returns the posted tweet URL.',
    category: 'Twitter',
    badge: 'New',
  },
  {
    icon: Search,
    title: 'Tweet Discover',
    description: 'Discover tweets by keyword using DuckDuckGo search. No API key required. Deduplicate via cache and enrich with engagement data.',
    category: 'Twitter',
  },
  {
    icon: TrendingUp,
    title: 'Tweet Tracker',
    description: 'Monitor tweet growth with ETCH burst detection algorithm. Track views, likes, retweets over time and detect viral moments.',
    category: 'Twitter',
  },
  {
    icon: BarChart3,
    title: 'Profile Analyzer',
    description: 'Analyze any Twitter profile — engagement rates, content breakdown, topic classification, top hashtags, and posting patterns.',
    category: 'Twitter',
  },
  {
    icon: Globe,
    title: 'Tweet Scraper',
    description: 'Fetch tweets, user profiles, and search results without API keys using FxTwitter public API and DuckDuckGo.',
    category: 'Twitter',
  },

  // Platform
  {
    icon: Users,
    title: 'Agent Teams',
    description: 'Create specialized agents per project. Delegate tasks between agents for collaborative workflows.',
    category: 'Platform',
  },
  {
    icon: Zap,
    title: 'Web Search & Scraping',
    description: 'Built-in web search (Tavily/SerpAPI) and Firecrawl page scraping. Agents can research topics and curate content.',
    category: 'Platform',
  },
  {
    icon: Brain,
    title: 'Vector Memory',
    description: 'Semantic search across stored memories using vector embeddings. Find relevant context for content creation.',
    category: 'Platform',
  },
  {
    icon: Shield,
    title: 'User Isolation',
    description: 'Per-user SQLite database with complete data isolation. Memories, projects, and integrations never leak across users.',
    category: 'Platform',
  },
];

const categories = ['Core', 'Content', 'Twitter', 'Platform'];

const categoryColors: Record<string, string> = {
  Core: 'bg-blue-50 text-blue-700 border-blue-200',
  Content: 'bg-purple-50 text-purple-700 border-purple-200',
  Twitter: 'bg-sky-50 text-sky-700 border-sky-200',
  Platform: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <FileText className="w-5 h-5 text-gray-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Features</h1>
      </div>
      <p className="text-gray-500 mb-8 ml-[52px]">
        Everything FoxFang can do for your marketing workflow.
      </p>

      {/* Feature grid by category */}
      {categories.map((category) => (
        <section key={category} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${categoryColors[category]}`}
            >
              {category}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features
              .filter((f) => f.category === category)
              .map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                      {feature.badge && (
                        <span className="px-2 py-0.5 rounded-full bg-lime-100 text-lime-700 text-xs font-semibold">
                          {feature.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
