'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutGrid, LogOut, Settings, ChevronDown, ChevronUp, Users, Upload, FileText, X, Sparkles, Activity, Lightbulb, Palette, Rocket, Bell, Globe, TrendingUp, BookOpen, Loader2, Link as LinkIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { createProject, analyzeWebsite, type BrandProfileInput } from '@/lib/api/projects';
import { API_BASE_URL } from '@/lib/api/client';

// Simple notification interface
export interface AppNotification {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { icon: LayoutGrid, label: 'Dashboard', href: '/dashboard' },
  { icon: Lightbulb, label: 'Ideas', href: '/ideas' },
  { icon: Rocket, label: 'Campaigns', href: '/campaigns' },
  { icon: Users, label: 'Agents', href: '/agents' },
  { icon: Activity, label: 'Boards', href: '/boards' },
  { icon: TrendingUp, label: 'Analytics', href: '/analytics' },
  { icon: BookOpen, label: 'Docs', href: '/docs' },
];

export default function AppShell({ children }: AppShellProps) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [brandFile, setBrandFile] = useState<File | null>(null);
  const [brandContent, setBrandContent] = useState<string>('');
  const [brandError, setBrandError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Two-mode project creation
  const [createMode, setCreateMode] = useState<'website' | 'manual'>('website');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Brand profile (optional)
  const [showBrandProfile, setShowBrandProfile] = useState(false);
  const [bpName, setBpName] = useState('');
  const [bpTagline, setBpTagline] = useState('');
  const [bpPrimaryColor, setBpPrimaryColor] = useState('#000000');
  const [bpSecondaryColor, setBpSecondaryColor] = useState('#A3E635');
  const [bpFontPrimary, setBpFontPrimary] = useState('');
  const [bpFontSecondary, setBpFontSecondary] = useState('');
  const [bpToneKeywords, setBpToneKeywords] = useState('');
  const [bpTargetAudience, setBpTargetAudience] = useState('');

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Listen for "open:create-project" events dispatched from other pages
  useEffect(() => {
    const handler = () => setIsCreateOpen(true);
    window.addEventListener('open:create-project', handler);
    return () => window.removeEventListener('open:create-project', handler);
  }, []);

  // Establish SSE connection for notifications
  useEffect(() => {
    if (!user) return;
    
    // Extract projectId from pathname if we are inside a project view
    const projectIdMatch = pathname.match(/\/(boards|campaigns|agents|ideas)\/([^/]+)/);
    const currentProjectId = projectIdMatch ? projectIdMatch[2] : localStorage.getItem('foxfang_project_id');
    
    if (!currentProjectId) return;

    const eventSource = new EventSource(`${API_BASE_URL}/projects/${currentProjectId}/events?userId=${encodeURIComponent(user.id)}`);

    const handleEventChunk = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.type === 'connected') return; // Ignore heartbeat/connected 
        
        let message = '';
        if (event.type === 'idea.ingested.v1') message = `New idea added: ${payload.idea?.title}`;
        else if (event.type === 'task.created.v1') message = `Task created: ${payload.task?.title}`;
        else if (event.type === 'task.updated.v1') message = `Task updated: ${payload.task?.title}`;
        else message = `Event received: ${event.type.replace('.v1', '')}`;
        
        setNotifications(prev => [{
          id: Math.random().toString(36).substring(7),
          type: event.type,
          message,
          timestamp: new Date(),
          read: false
        }, ...prev].slice(0, 50)); // Keep last 50
        
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    // Listen to standard events
    ['idea.ingested.v1', 'task.created.v1', 'task.updated.v1', 'project.context.loaded.v1', 'content.draft.generated.v1', 'content.edited.v1', 'content.approved.v1', 'agent.error.v1'].forEach(eventType => {
      eventSource.addEventListener(eventType, handleEventChunk);
    });

    return () => {
      eventSource.close();
    };
  }, [user, pathname]);

  const userInitial = useMemo(() => {
    return user?.email?.charAt(0).toUpperCase() || 'L';
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleBrandFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['md', 'txt'];

    if (!allowedExts.includes(ext)) {
      setBrandError('Only .md and .txt files are supported.');
      setBrandFile(null);
      setBrandContent('');
      return;
    }

    setBrandError(null);
    setBrandFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setBrandContent((event.target?.result as string) || '');
    };
    reader.onerror = () => {
      setBrandError('Failed to read file.');
      setBrandFile(null);
      setBrandContent('');
    };
    reader.readAsText(file, 'utf-8');
  };

  const removeBrandFile = () => {
    setBrandFile(null);
    setBrandContent('');
    setBrandError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateProject = async () => {
    if (!user || !projectName.trim()) {
      setCreateError('Project name is required');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      // Build brand profile if expanded/auto-filled and has at least a name
      let brandProfile: BrandProfileInput | undefined;
      if ((showBrandProfile || createMode === 'website') && bpName.trim()) {
        const toneKeywords = bpToneKeywords.split(',').map(t => t.trim()).filter(Boolean);
        brandProfile = {
          name: bpName.trim(),
          tagline: bpTagline.trim() || undefined,
          primaryColor: bpPrimaryColor || undefined,
          secondaryColor: bpSecondaryColor || undefined,
          fontPrimary: bpFontPrimary.trim() || undefined,
          fontSecondary: bpFontSecondary.trim() || undefined,
          toneKeywords: toneKeywords.length > 0 ? toneKeywords : undefined,
          targetAudience: bpTargetAudience.trim() || undefined
        };
      }

      const project = await createProject({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        avatarUrl: user.avatar_url,
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        brandContent: brandContent || undefined,
        brandProfile
      });

      localStorage.setItem('foxfang_project_id', project.id);
      
      // Dispatch event to notify other components (e.g., boards page) to refresh projects
      window.dispatchEvent(new CustomEvent('project:created', { 
        detail: { projectId: project.id, projectName: project.name } 
      }));
      
      setIsCreateOpen(false);
      setProjectName('');
      setProjectDescription('');
      setBrandFile(null);
      setBrandContent('');
      resetBrandProfile();
      router.push('/boards');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const resetBrandProfile = () => {
    setShowBrandProfile(false);
    setBpName('');
    setBpTagline('');
    setBpPrimaryColor('#000000');
    setBpSecondaryColor('#A3E635');
    setBpFontPrimary('');
    setBpFontSecondary('');
    setBpToneKeywords('');
    setBpTargetAudience('');
  };

  const handleCreateFromWebsite = async () => {
    if (!user || !websiteUrl.trim()) return;

    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setCreateError(null);

      // Step 1: Analyze website
      const result = await analyzeWebsite(user.id, websiteUrl.trim());

      const name = result.name || new URL(websiteUrl.trim()).hostname.replace('www.', '');
      const description = result.description || '';
      const toneKeywords = result.toneAdjectives.length > 0 ? result.toneAdjectives : [];
      const brandDoc = result.brandDocument || '';

      setIsAnalyzing(false);

      // Step 2: Create project directly with analyzed data
      setIsCreating(true);

      const brandProfile: BrandProfileInput = {
        name: name,
        tagline: result.tagline || undefined,
        primaryColor: result.brandColors?.[0] || undefined,
        secondaryColor: result.brandColors?.[1] || undefined,
        fontPrimary: result.typography || undefined,
        toneKeywords: toneKeywords.length > 0 ? toneKeywords : undefined,
        targetAudience: result.targetAudience || undefined,
      };

      const project = await createProject({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        avatarUrl: user.avatar_url,
        name,
        description: description || undefined,
        brandContent: brandDoc || undefined,
        brandProfile,
      });

      localStorage.setItem('foxfang_project_id', project.id);
      window.dispatchEvent(new CustomEvent('project:created', {
        detail: { projectId: project.id, projectName: project.name }
      }));

      closeCreateModal();
      router.push('/boards');
    } catch (error) {
      if (isAnalyzing) {
        setAnalysisError(error instanceof Error ? error.message : 'Failed to analyze website');
        setIsAnalyzing(false);
      } else {
        setCreateError(error instanceof Error ? error.message : 'Failed to create project');
      }
    } finally {
      setIsCreating(false);
      setIsAnalyzing(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setBrandError(null);
    setBrandFile(null);
    setBrandContent('');
    setWebsiteUrl('');
    setAnalysisError(null);
    setIsAnalyzing(false);
    setCreateMode('website');
    resetBrandProfile();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isActive = (href: string) => pathname === href;

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Sidebar - White clean style */}
      <aside className={`${isSidebarCollapsed ? 'w-[60px]' : 'w-[200px]'} bg-white shrink-0 hidden lg:flex flex-col overflow-y-auto py-4 ${isSidebarCollapsed ? 'px-2' : 'px-3'} border-r border-gray-200 transition-all duration-200`}>
        {/* Logo */}
        <Link href="/" className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'} px-2 mb-6`}>
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {!isSidebarCollapsed && (
            <span className="text-base font-bold text-gray-900">FoxFang</span>
          )}
        </Link>

        {/* Menu Label */}
        {!isSidebarCollapsed && (
          <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Menu</p>
        )}

        {/* Navigation */}
        <nav className="space-y-1 mb-6">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'} px-2.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-indigo-500' : 'text-gray-400'}`} />
                {!isSidebarCollapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse toggle */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="flex items-center justify-center w-full px-2.5 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed
            ? <PanelLeftOpen className="w-5 h-5" />
            : <PanelLeftClose className="w-5 h-5" />
          }
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Clean white style */}
        <header className="shrink-0 px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Good Morning, {user?.name?.split(' ')[0] || 'John'}
              </h2>
              <p className="text-xs text-gray-500">Your latest system updates here</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Notification Bell */}
              <div className="relative">
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center hover:border-gray-300 transition-all relative"
                >
                  <Bell className="w-[18px] h-[18px] text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden flex flex-col max-h-[360px]">
                      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
                        <h3 className="text-xs font-semibold text-gray-900">Notifications</h3>
                        {unreadCount > 0 && (
                          <button 
                            onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                            className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            Mark all as read
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
                        {notifications.length === 0 ? (
                          <div className="px-3 py-6 text-center text-xs text-gray-500">
                            No new notifications
                          </div>
                        ) : (
                          notifications.map(notif => (
                            <div 
                              key={notif.id} 
                              onClick={() => {
                                setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                              }}
                              className={`p-2 rounded-lg flex items-start gap-2 cursor-pointer transition-colors ${notif.read ? 'hover:bg-gray-50' : 'bg-indigo-50/50 hover:bg-indigo-50'}`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${notif.read ? 'bg-transparent' : 'bg-indigo-500'}`} />
                              <div>
                                <p className={`text-xs ${notif.read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                                  {notif.message}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {notif.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Globe */}
              <button className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center hover:border-gray-300 transition-all">
                <Globe className="w-[18px] h-[18px] text-gray-600" />
              </button>

              {/* Create Button */}
              <button
                onClick={() => {
                  setCreateError(null);
                  setIsCreateOpen(true);
                }}
                className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-all"
              >
                + New Project
              </button>

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg pl-1 pr-2.5 py-1 hover:border-gray-300 transition-all"
                >
                  <div className="w-7 h-7 bg-gray-200 rounded-md flex items-center justify-center text-gray-700 text-xs font-medium">
                    {userInitial}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-xs font-medium text-gray-900">{user?.name || 'User'}</p>
                    <p className="text-[10px] text-gray-500">@admin</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>

                {isProfileOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-gray-200 z-50 py-1.5">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-200 rounded-md flex items-center justify-center text-gray-700 text-xs font-medium">
                            {userInitial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{user?.name || 'User'}</p>
                            <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
                          </div>
                        </div>
                      </div>

                      <div className="py-0.5">
                        <button className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors">Profile</button>
                        <Link href="/settings" className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors">Settings</Link>
                      </div>

                      <div className="border-t border-gray-100 my-0.5" />

                      <div className="py-0.5">
                        <button
                          onClick={handleLogout}
                          className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Log out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content - Scrollable */}
        <main className="flex-1 overflow-y-auto px-4 bg-white">
          {children}
        </main>
      </div>

      {/* Create Project Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeCreateModal} />
          <div className="relative bg-white rounded-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Create new project</h2>
              <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => setCreateMode('website')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 ${
                  createMode === 'website'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                From Website
              </button>
              <button
                onClick={() => setCreateMode('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 ${
                  createMode === 'manual'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Manual Input
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* From Website mode — only URL input */}
              {createMode === 'website' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Website URL</label>
                    <input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="https://example.com"
                      disabled={isAnalyzing}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Paste your website URL and we&apos;ll auto-generate your brand profile.</p>
                    {analysisError && (
                      <p className="mt-1.5 text-xs text-red-600">{analysisError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Manual mode fields */}
              {createMode === 'manual' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project name</label>
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      placeholder="e.g. Growth sprint Q2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[60px] resize-none"
                      placeholder="What is this project about?"
                    />
                  </div>
                </>
              )}

              {/* Brand document upload (manual mode only) */}
              {createMode === 'manual' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Brand document
                    <span className="ml-1 text-[10px] font-normal text-gray-400">optional</span>
                  </label>
                  <p className="text-[10px] text-gray-500 mb-1.5">Accepts <strong>.md</strong> or <strong>.txt</strong>.</p>

                  {!brandFile ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-lg py-4 px-3 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all"
                    >
                      <Upload className="w-4 h-4 opacity-60" />
                      <span>Click to upload</span>
                      <span className="text-[10px] text-gray-400">.md or .txt — max 1 MB</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50">
                      <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{brandFile.name}</p>
                        <p className="text-[10px] text-gray-500">{(brandFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button type="button" onClick={removeBrandFile} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept=".md,.txt" className="hidden" onChange={handleBrandFileChange} />
                  {brandError && <p className="mt-1 text-[10px] text-red-600">{brandError}</p>}
                </div>
              )}

              {/* Brand Profile (manual mode only, collapsible) */}
              {createMode === 'manual' && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBrandProfile(!showBrandProfile)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="font-medium text-gray-700">Brand Profile</span>
                    <span className="text-[10px] font-normal text-gray-400">optional</span>
                  </div>
                  {showBrandProfile
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  }
                </button>

                {showBrandProfile && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-500 pt-2">Define your brand identity.</p>

                    <div>
                      <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Brand name</label>
                      <input
                        value={bpName}
                        onChange={(e) => setBpName(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="e.g. Acme Corp"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Tagline</label>
                      <input
                        value={bpTagline}
                        onChange={(e) => setBpTagline(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="Your brand motto"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Primary color</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={bpPrimaryColor}
                            onChange={(e) => setBpPrimaryColor(e.target.value)}
                            className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer p-0 overflow-hidden"
                          />
                          <input
                            value={bpPrimaryColor}
                            onChange={(e) => setBpPrimaryColor(e.target.value)}
                            className="flex-1 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Secondary color</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={bpSecondaryColor}
                            onChange={(e) => setBpSecondaryColor(e.target.value)}
                            className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer p-0 overflow-hidden"
                          />
                          <input
                            value={bpSecondaryColor}
                            onChange={(e) => setBpSecondaryColor(e.target.value)}
                            className="flex-1 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Primary font</label>
                        <input
                          value={bpFontPrimary}
                          onChange={(e) => setBpFontPrimary(e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. Inter"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Secondary font</label>
                        <input
                          value={bpFontSecondary}
                          onChange={(e) => setBpFontSecondary(e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          placeholder="e.g. Georgia"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                        Tone keywords
                      </label>
                      <input
                        value={bpToneKeywords}
                        onChange={(e) => setBpToneKeywords(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="professional, friendly"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Target audience</label>
                      <input
                        value={bpTargetAudience}
                        onChange={(e) => setBpTargetAudience(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="e.g. SaaS founders"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              {createError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{createError}</div>
              )}
            </div>

            <div className="p-4 pt-0 flex items-center justify-end gap-2">
              <button onClick={closeCreateModal} className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              {createMode === 'website' ? (
                <button
                  onClick={handleCreateFromWebsite}
                  disabled={isCreating || isAnalyzing || !websiteUrl.trim()}
                  className="px-4 py-2 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-60 transition-all flex items-center gap-1.5"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Create
                    </>
                  )}
                </button>
              ) : (
                <button onClick={handleCreateProject} disabled={isCreating || !!brandError} className="px-4 py-2 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-60 transition-all">
                  {isCreating ? 'Creating...' : 'Create project'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
