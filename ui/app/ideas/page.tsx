'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, Plus, Search, X, FileText, Quote, Image, StickyNote, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { listIdeas, createIdea, deleteIdea, type Idea, type IdeaType } from '@/lib/api/ideas';
import { listProjects } from '@/lib/api/projects';

const typeConfig: Record<IdeaType, { icon: typeof StickyNote; label: string; color: string; bg: string }> = {
  note: { icon: StickyNote, label: 'Note', color: 'text-amber-600', bg: 'bg-amber-100' },
  article: { icon: FileText, label: 'Article', color: 'text-blue-600', bg: 'bg-blue-100' },
  quote: { icon: Quote, label: 'Quote', color: 'text-purple-600', bg: 'bg-purple-100' },
  image: { icon: Image, label: 'Image', color: 'text-pink-600', bg: 'bg-pink-100' }
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function IdeasPage() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Add idea form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<IdeaType>('note');
  const [newTags, setNewTags] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const userId = user?.id || '';

  const fetchIdeas = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const result = await listIdeas({
        userId,
        projectId: filterProject || undefined,
        type: filterType || undefined,
        search: searchQuery || undefined
      });
      setIdeas(result);
    } catch {
      setIdeas([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, filterProject, filterType, searchQuery]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  useEffect(() => {
    if (!userId) return;
    listProjects(userId).then(setProjects).catch(() => setProjects([]));
  }, [userId]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      setCreateError('Title and content are required');
      return;
    }
    try {
      setIsCreating(true);
      setCreateError(null);
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      await createIdea({
        userId,
        title: newTitle.trim(),
        content: newContent.trim(),
        type: newType,
        tags: tags.length > 0 ? tags : undefined,
        sourceUrl: newSourceUrl.trim() || undefined,
        projectId: newProjectId || undefined
      });
      setIsAddOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewType('note');
      setNewTags('');
      setNewSourceUrl('');
      setNewProjectId('');
      fetchIdeas();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create idea');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (ideaId: string) => {
    try {
      await deleteIdea(userId, ideaId);
      setIdeas(prev => prev.filter(i => i.id !== ideaId));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Idea Stream</h1>
          <p className="text-sm text-gray-500 mt-1">Capture inspiration, articles, quotes, and notes</p>
        </div>
        <button
          onClick={() => { setCreateError(null); setIsAddOpen(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Idea
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ideas..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 p-1">
          {[
            { value: '', label: 'All' },
            { value: 'note', label: 'Notes' },
            { value: 'article', label: 'Articles' },
            { value: 'quote', label: 'Quotes' },
            { value: 'image', label: 'Images' }
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                filterType === opt.value
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Ideas grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <Lightbulb className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No ideas yet</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Start capturing inspiration, articles, quotes, and notes. They will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ideas.map((idea) => {
            const cfg = typeConfig[idea.type] || typeConfig.note;
            const Icon = cfg.icon;
            return (
              <div
                key={idea.id}
                className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-gray-300 transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{idea.title}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(idea.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(idea.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    aria-label="Delete idea"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-gray-600 line-clamp-3 mb-3">{idea.content}</p>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {idea.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-full">
                      {tag}
                    </span>
                  ))}
                  {idea.sourceUrl && (
                    <a
                      href={idea.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-600 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Source
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Idea Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsAddOpen(false)} />
          <div className="relative bg-white rounded-2xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Idea</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="What's your idea?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as IdeaType)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                >
                  <option value="note">Note</option>
                  <option value="article">Article</option>
                  <option value="quote">Quote</option>
                  <option value="image">Image</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[120px] resize-none"
                  placeholder="Write your idea, paste an article excerpt, or add a quote..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tags <span className="text-xs font-normal text-gray-400">comma-separated</span>
                </label>
                <input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="marketing, social, content"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Source URL <span className="text-xs font-normal text-gray-400">optional</span>
                </label>
                <input
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="https://..."
                />
              </div>

              {projects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Project <span className="text-xs font-normal text-gray-400">optional</span>
                  </label>
                  <select
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {createError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{createError}</div>
              )}
            </div>

            <div className="p-6 pt-0 flex items-center justify-end gap-3">
              <button onClick={() => setIsAddOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-6 py-2.5 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-60 transition-all"
              >
                {isCreating ? 'Adding...' : 'Add idea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
