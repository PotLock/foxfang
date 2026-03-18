'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProjects, Project } from '@/lib/api/projects';
import { LayoutGrid, List, FolderKanban, Clock, ChevronRight, Plus, Search } from 'lucide-react';

type ViewMode = 'grid' | 'list';

function formatDate(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString();
}

export default function BoardsIndexPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    if (!user) return;

    const loadProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const list = await listProjects(user.id);
        setProjects(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();

    // Listen for project creation events from AppShell
    const handleProjectCreated = () => {
      loadProjects();
    };

    window.addEventListener('project:created', handleProjectCreated);

    // Also refresh when window gains focus (in case projects were created in another tab)
    const handleFocus = () => {
      loadProjects();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('project:created', handleProjectCreated);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const hasProjects = projects.length > 0;

  const headerSubtitle = useMemo(() => {
    if (!hasProjects) return 'Create your first project to start a board.';
    return `${projects.length} project${projects.length === 1 ? '' : 's'} available`;
  }, [hasProjects, projects.length]);

  const handleOpenProject = (project: Project) => {
    localStorage.setItem('foxfang_project_id', project.id);
    router.push(`/boards/${project.id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-xs text-gray-500 mt-0.5">{headerSubtitle}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="hidden md:flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-200">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-transparent text-xs outline-none w-28"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-white rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-all ${
                view === 'grid' 
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md transition-all ${
                view === 'list' 
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasProjects ? (
        <div className="bg-white rounded-xl p-10 text-center border border-gray-200">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FolderKanban className="w-6 h-6 text-indigo-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1.5">No projects yet</h2>
          <p className="text-sm text-gray-500 mb-4">Use the Create button in the header to add a project.</p>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('open:create-project'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Create project
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, index) => {
            const colors = [
              'bg-blue-500',
              'bg-indigo-500',
              'bg-purple-500',
              'bg-emerald-500',
              'bg-amber-500',
              'bg-pink-500'
            ];
            
            return (
              <button
                key={project.id}
                onClick={() => handleOpenProject(project)}
                className="text-left bg-white rounded-xl p-4 border border-gray-200 hover:border-gray-300 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 ${colors[index % colors.length]} rounded-xl flex items-center justify-center`}>
                    <FolderKanban className="w-5 h-5 text-white" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{project.name}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                  {project.description || 'No description yet'}
                </p>
                
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {formatDate(project.createdAt)}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {projects.map((project, index) => {
            const colors = [
              'bg-blue-500',
              'bg-indigo-500',
              'bg-purple-500',
              'bg-emerald-500',
              'bg-amber-500',
              'bg-pink-500'
            ];
            
            return (
              <button
                key={project.id}
                onClick={() => handleOpenProject(project)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                  index !== 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${colors[index % colors.length]} rounded-lg flex items-center justify-center`}>
                    <FolderKanban className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                    <p className="text-xs text-gray-500">
                      {project.description || 'No description yet'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{formatDate(project.createdAt)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
