'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, FileText, Upload, Trash2, ChevronRight, ArrowLeft, Palette, Image as ImageIcon } from 'lucide-react';
import { Project, updateProject, deleteProject, uploadProjectBrand } from '@/lib/api/projects';
import { BrandProfile, getBrandProfile, saveBrandProfile, uploadBrandLogo } from '@/lib/api/brandProfile';

type Panel = 'menu' | 'edit' | 'brand' | 'brand-profile' | 'delete';

interface ProjectSettingsModalProps {
  open: boolean;
  project: Project;
  userId: string;
  onClose: () => void;
  onUpdated: (project: Project) => void;
  onDeleted: () => void;
}

export default function ProjectSettingsModal({
  open,
  project,
  userId,
  onClose,
  onUpdated,
  onDeleted
}: ProjectSettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>('menu');

  // Edit info state
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(project.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Brand upload state
  const [brandFile, setBrandFile] = useState<File | null>(null);
  const [brandContent, setBrandContent] = useState('');
  const [brandError, setBrandError] = useState<string | null>(null);
  const [isUploadingBrand, setIsUploadingBrand] = useState(false);
  const [brandSuccess, setBrandSuccess] = useState(false);

  // Delete state
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Brand Profile state
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  
  // Brand Profile form state
  const [bpName, setBpName] = useState('');
  const [bpTagline, setBpTagline] = useState('');
  const [bpPrimaryColor, setBpPrimaryColor] = useState('#4F46E5');
  const [bpSecondaryColor, setBpSecondaryColor] = useState('#6B7280');
  const [bpFontPrimary, setBpFontPrimary] = useState('');
  const [bpFontSecondary, setBpFontSecondary] = useState('');
  const [bpToneKeywords, setBpToneKeywords] = useState('');
  const [bpTargetAudience, setBpTargetAudience] = useState('');
  
  // Tone Profile state
  const [bpDoList, setBpDoList] = useState('');
  const [bpDontList, setBpDontList] = useState('');
  const [bpForbiddenWords, setBpForbiddenWords] = useState('');
  const [bpCtaPatterns, setBpCtaPatterns] = useState('');
  const [bpVocabulary, setBpVocabulary] = useState('');
  
  // Logo upload state
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  if (!open) return null;

  const resetToMenu = () => {
    setPanel('menu');
    setSaveError(null);
    setBrandError(null);
    setBrandSuccess(false);
    setBrandFile(null);
    setBrandContent('');
    setDeleteError(null);
    setDeleteConfirmText('');
    setProfileError(null);
    setProfileSuccess(false);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleClose = () => {
    resetToMenu();
    onClose();
  };

  /* ── Load brand profile ─────────────────────────────────────── */
  const loadBrandProfile = useCallback(async () => {
    if (!userId || !project?.id) return;
    setIsLoadingProfile(true);
    setProfileError(null);
    try {
      const profile = await getBrandProfile(userId, project.id);
      setBrandProfile(profile);
      if (profile) {
        setBpName(profile.name || '');
        setBpTagline(profile.tagline || '');
        setBpPrimaryColor(profile.primaryColor || '#4F46E5');
        setBpSecondaryColor(profile.secondaryColor || '#6B7280');
        setBpFontPrimary(profile.fontPrimary || '');
        setBpFontSecondary(profile.fontSecondary || '');
        setBpToneKeywords(profile.toneKeywords?.join(', ') || '');
        setBpTargetAudience(profile.targetAudience || '');
        setBpDoList(profile.toneProfile?.doList?.join('\n') || '');
        setBpDontList(profile.toneProfile?.dontList?.join('\n') || '');
        setBpForbiddenWords(profile.toneProfile?.forbiddenWords?.join(', ') || '');
        setBpCtaPatterns(profile.toneProfile?.ctaPatterns?.join('\n') || '');
        setBpVocabulary(profile.toneProfile?.vocabulary?.join(', ') || '');
        setLogoPreview(profile.logoPath || null);
      } else {
        setBpName('');
        setBpTagline('');
        setBpPrimaryColor('#4F46E5');
        setBpSecondaryColor('#6B7280');
        setBpFontPrimary('');
        setBpFontSecondary('');
        setBpToneKeywords('');
        setBpTargetAudience('');
        setBpDoList('');
        setBpDontList('');
        setBpForbiddenWords('');
        setBpCtaPatterns('');
        setBpVocabulary('');
        setLogoPreview(null);
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to load brand profile');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [userId, project?.id]);

  useEffect(() => {
    if (panel === 'brand-profile' && project?.id) {
      loadBrandProfile();
    }
  }, [panel, project?.id, loadBrandProfile]);

  /* ── Save brand profile ─────────────────────────────────────── */
  const handleSaveProfile = async () => {
    if (!userId || !project?.id) return;
    try {
      setIsSavingProfile(true);
      setProfileError(null);
      setProfileSuccess(false);
      
      const toneKeywords = bpToneKeywords.split(',').map(t => t.trim()).filter(Boolean);
      
      const doList = bpDoList.split('\n').map(t => t.trim()).filter(Boolean);
      const dontList = bpDontList.split('\n').map(t => t.trim()).filter(Boolean);
      const forbiddenWords = bpForbiddenWords.split(',').map(t => t.trim()).filter(Boolean);
      const ctaPatterns = bpCtaPatterns.split('\n').map(t => t.trim()).filter(Boolean);
      const vocabulary = bpVocabulary.split(',').map(t => t.trim()).filter(Boolean);
      
      const toneProfile = {
        ...(doList.length ? { doList } : {}),
        ...(dontList.length ? { dontList } : {}),
        ...(forbiddenWords.length ? { forbiddenWords } : {}),
        ...(ctaPatterns.length ? { ctaPatterns } : {}),
        ...(vocabulary.length ? { vocabulary } : {})
      };
      
      const saved = await saveBrandProfile({
        userId,
        projectId: project.id,
        name: bpName.trim() || undefined,
        tagline: bpTagline.trim() || undefined,
        primaryColor: bpPrimaryColor,
        secondaryColor: bpSecondaryColor,
        fontPrimary: bpFontPrimary.trim() || undefined,
        fontSecondary: bpFontSecondary.trim() || undefined,
        toneKeywords: toneKeywords.length > 0 ? toneKeywords : undefined,
        targetAudience: bpTargetAudience.trim() || undefined,
        toneProfile: Object.keys(toneProfile).length > 0 ? toneProfile : undefined
      });
      
      setBrandProfile(saved);
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save brand profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  /* ── Logo upload ────────────────────────────────────────────── */
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setLogoError('Only PNG, JPEG, and SVG files are allowed');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('File size must be less than 2MB');
      return;
    }
    
    setLogoError(null);
    setLogoFile(file);
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    if (!userId || !project?.id || !logoFile) return;
    
    try {
      setIsUploadingLogo(true);
      setLogoError(null);
      
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string)?.split(',')[1];
        if (!base64) {
          setLogoError('Failed to process image');
          setIsUploadingLogo(false);
          return;
        }
        
        try {
          const result = await uploadBrandLogo({
            userId,
            projectId: project.id,
            filename: logoFile.name,
            base64,
            mimeType: logoFile.type
          });
          setLogoPreview(result.logoPath);
          setLogoFile(null);
          if (logoInputRef.current) logoInputRef.current.value = '';
        } catch (err) {
          setLogoError(err instanceof Error ? err.message : 'Failed to upload logo');
        } finally {
          setIsUploadingLogo(false);
        }
      };
      reader.onerror = () => {
        setLogoError('Failed to read file');
        setIsUploadingLogo(false);
      };
      reader.readAsDataURL(logoFile);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Failed to upload logo');
      setIsUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    if (!brandProfile?.logoPath) {
      setLogoPreview(null);
    }
    setLogoError(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  /* ── Edit project info ─────────────────────────────────────── */
  const handleSaveInfo = async () => {
    if (!editName.trim()) { setSaveError('Project name is required'); return; }
    try {
      setIsSaving(true);
      setSaveError(null);
      const updated = await updateProject({
        userId,
        projectId: project.id,
        name: editName.trim(),
        description: editDescription.trim() || null
      });
      onUpdated(updated);
      setPanel('menu');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Brand document upload ─────────────────────────────────── */
  const handleBrandFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['md', 'txt'].includes(ext)) {
      setBrandError('Only .md and .txt files are supported.');
      setBrandFile(null);
      setBrandContent('');
      return;
    }
    setBrandError(null);
    setBrandFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBrandContent((ev.target?.result as string) || '');
    reader.onerror = () => { setBrandError('Failed to read file.'); setBrandFile(null); setBrandContent(''); };
    reader.readAsText(file, 'utf-8');
  };

  const removeBrandFile = () => {
    setBrandFile(null);
    setBrandContent('');
    setBrandError(null);
    setBrandSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadBrand = async () => {
    if (!brandContent.trim()) return;
    try {
      setIsUploadingBrand(true);
      setBrandError(null);
      await uploadProjectBrand({ userId, projectId: project.id, brandContent: brandContent.trim() });
      setBrandSuccess(true);
      setBrandFile(null);
      setBrandContent('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Failed to upload brand');
    } finally {
      setIsUploadingBrand(false);
    }
  };

  /* ── Delete project ────────────────────────────────────────── */
  const handleDelete = async () => {
    if (deleteConfirmText !== project.name) {
      setDeleteError('Project name does not match');
      return;
    }
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteProject({ userId, projectId: project.id });
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project');
      setIsDeleting(false);
    }
  };

  /* ── Panel titles ──────────────────────────────────────────── */
  const panelTitle: Record<Panel, string> = {
    menu: 'Project settings',
    edit: 'Edit project info',
    brand: 'Brand document',
    'brand-profile': 'Brand Profile',
    delete: 'Delete project'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          {panel !== 'menu' && (
            <button
              onClick={resetToMenu}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="flex-1 text-base font-semibold text-gray-900">{panelTitle[panel]}</h2>
          <button 
            onClick={handleClose} 
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" 
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Main menu ─────────────────────────────────────────── */}
        {panel === 'menu' && (
          <div className="py-2">
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Project</p>
              <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3 border border-gray-200">
                <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                {project.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{project.description}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => { setEditName(project.name); setEditDescription(project.description || ''); setPanel('edit'); }}
              className="w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-gray-700">Edit project info</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              onClick={() => { setBrandSuccess(false); setPanel('brand'); }}
              className="w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Brand document</span>
                {project.hasBrand && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">Uploaded</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              onClick={() => { setProfileSuccess(false); setPanel('brand-profile'); }}
              className="w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-700">Brand Profile</span>
                {brandProfile?.name && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-700 rounded-full">{brandProfile.name}</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <div className="border-t border-gray-200 my-1" />

            <button
              onClick={() => { setDeleteConfirmText(''); setPanel('delete'); }}
              className="w-full flex items-center justify-between px-5 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="font-medium">Delete project</span>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Edit info panel ────────────────────────────────────── */}
        {panel === 'edit' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Project name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[80px] resize-none"
                placeholder="What is this project about?"
              />
            </div>
            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={resetToMenu} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveInfo}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-60 transition-colors"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Brand document panel ───────────────────────────────── */}
        {panel === 'brand' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-600">
              Upload a brand guide (<strong>.md</strong> or <strong>.txt</strong>) so all agents in this project know your brand voice, audience, and messaging rules.
            </p>

            {brandSuccess ? (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="w-5 h-5 rounded-full bg-emerald-500 shrink-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Brand document applied</p>
                  <p className="text-xs text-gray-600 mt-0.5">All agents have been updated with the new brand context.</p>
                </div>
              </div>
            ) : !brandFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl py-8 px-4 text-sm text-gray-600 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all"
              >
                <Upload className="w-6 h-6 opacity-60" />
                <span>Click to upload brand document</span>
                <span className="text-xs text-gray-400">.md or .txt — max 1 MB</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-3 bg-white">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{brandFile.name}</p>
                  <p className="text-xs text-gray-500">{(brandFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={removeBrandFile}
                  className="p-1 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              className="hidden"
              onChange={handleBrandFileChange}
            />

            {brandError && (
              <p className="text-xs text-red-600">{brandError}</p>
            )}

            {!brandSuccess && (
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={resetToMenu} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUploadBrand}
                  disabled={!brandContent.trim() || isUploadingBrand}
                  className="px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-60 transition-colors"
                >
                  {isUploadingBrand ? 'Applying…' : 'Apply brand'}
                </button>
              </div>
            )}
            {brandSuccess && (
              <div className="flex justify-end">
                <button onClick={resetToMenu} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Brand Profile panel ───────────────────────────────── */}
        {panel === 'brand-profile' && (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {isLoadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brand Logo</label>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      <div className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                        <img 
                          src={logoPreview?.startsWith('http') || logoPreview?.startsWith('data:') ? logoPreview : `file://${logoPreview}`} 
                          alt="Logo preview" 
                          className="w-full h-full object-contain p-1"
                        />
                        <button
                          onClick={removeLogo}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                      >
                        {logoPreview ? 'Change logo' : 'Upload logo'}
                      </button>
                      <p className="text-[10px] text-gray-400 mt-1">PNG, JPEG, or SVG — max 2MB</p>
                    </div>
                  </div>
                  {logoFile && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-600">{logoFile.name}</span>
                      <button
                        onClick={handleUploadLogo}
                        disabled={isUploadingLogo}
                        className="px-2 py-0.5 text-[10px] font-medium bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-60"
                      >
                        {isUploadingLogo ? 'Uploading...' : 'Upload'}
                      </button>
                    </div>
                  )}
                  {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
                </div>

                {/* Brand Identity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                  <input
                    value={bpName}
                    onChange={(e) => setBpName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="e.g., Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                  <input
                    value={bpTagline}
                    onChange={(e) => setBpTagline(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="e.g., Innovation for everyone"
                  />
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bpPrimaryColor}
                        onChange={(e) => setBpPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1"
                      />
                      <input
                        type="text"
                        value={bpPrimaryColor}
                        onChange={(e) => setBpPrimaryColor(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="#4F46E5"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bpSecondaryColor}
                        onChange={(e) => setBpSecondaryColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1"
                      />
                      <input
                        type="text"
                        value={bpSecondaryColor}
                        onChange={(e) => setBpSecondaryColor(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        placeholder="#6B7280"
                      />
                    </div>
                  </div>
                </div>

                {/* Fonts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Font</label>
                  <input
                    value={bpFontPrimary}
                    onChange={(e) => setBpFontPrimary(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="e.g., Inter, Helvetica"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Font</label>
                  <input
                    value={bpFontSecondary}
                    onChange={(e) => setBpFontSecondary(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="e.g., Georgia, serif"
                  />
                </div>

                {/* Tone & Voice */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tone Keywords <span className="text-xs font-normal text-gray-400">comma-separated</span>
                  </label>
                  <input
                    value={bpToneKeywords}
                    onChange={(e) => setBpToneKeywords(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="professional, friendly, innovative"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
                  <textarea
                    value={bpTargetAudience}
                    onChange={(e) => setBpTargetAudience(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[60px] resize-none"
                    placeholder="Describe your target audience..."
                  />
                </div>

                <div className="border-t border-gray-200 my-4" />
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Advanced Tone Rules</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Do use <span className="text-[10px] text-gray-400 font-normal">one per line</span>
                    </label>
                    <textarea
                      value={bpDoList}
                      onChange={(e) => setBpDoList(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all min-h-[80px] resize-none"
                      placeholder="e.g. active voice&#10;short sentences"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Don't use <span className="text-[10px] text-gray-400 font-normal">one per line</span>
                    </label>
                    <textarea
                      value={bpDontList}
                      onChange={(e) => setBpDontList(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all min-h-[80px] resize-none"
                      placeholder="e.g. corporate jargon&#10;passive voice"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forbidden Words <span className="text-xs font-normal text-gray-400">comma-separated</span>
                  </label>
                  <input
                    value={bpForbiddenWords}
                    onChange={(e) => setBpForbiddenWords(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                    placeholder="synergy, leverage, innovative"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Vocabulary <span className="text-xs font-normal text-gray-400">comma-separated</span>
                  </label>
                  <input
                    value={bpVocabulary}
                    onChange={(e) => setBpVocabulary(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="discover, empower, simple"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CTA Patterns <span className="text-[10px] text-gray-400 font-normal">one per line</span>
                  </label>
                  <textarea
                    value={bpCtaPatterns}
                    onChange={(e) => setBpCtaPatterns(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[60px] resize-none"
                    placeholder="e.g. Start your free trial today&#10;Get started in 5 minutes"
                  />
                </div>

                {/* Success/Error Messages */}
                {profileSuccess && (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 shrink-0 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Brand profile saved</p>
                      <p className="text-xs text-gray-600 mt-0.5">All agents have been updated with the new brand context.</p>
                    </div>
                  </div>
                )}

                {profileError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2">{profileError}</p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    onClick={resetToMenu} 
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-60 transition-colors"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save brand profile'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Delete panel ───────────────────────────────────────── */}
        {panel === 'delete' && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                This will permanently delete <strong>{project.name}</strong> and all its tasks, agent workspaces, and memory. This action cannot be undone.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Type <strong className="text-gray-900">{project.name}</strong> to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                placeholder={project.name}
              />
            </div>

            {deleteError && (
              <p className="text-xs text-red-600">{deleteError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={resetToMenu} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteConfirmText !== project.name}
                className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
