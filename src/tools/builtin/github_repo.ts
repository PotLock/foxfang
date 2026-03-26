/**
 * GitHub Repository Read Tools
 *
 * Read repository metadata, files, and code via the GitHub API.
 */

import path from 'node:path';
import { Tool, ToolCategory, ToolResult } from '../traits';
import { loadConfig } from '../../config';
import {
  extractOwnerRepo,
  getGitHubToken,
  githubApiRequest,
} from '../../integrations/github';

type OwnerRepo = {
  owner: string;
  repo: string;
};

type RepoTreeEntry = {
  path: string;
  type: string;
  size?: number;
};

type ResolvedFileMatch = {
  path: string;
  score: number;
  url?: string;
  source: 'tree' | 'search';
};

const repoTreeCache = new Map<string, { expiresAt: number; entries: RepoTreeEntry[] }>();
const REPO_TREE_CACHE_TTL_MS = 60_000;

async function buildGitHubReconnectMessage(): Promise<string> {
  const generic = [
    'GitHub is not connected.',
    '',
    'To connect:',
    '1. Use OAuth: github_connect with action: "oauth"',
    '2. Or set token manually: github_connect with action: "set", token: "your_token_here"',
    '',
    'GitHub App connections are configured in the wizard.',
  ].join('\n');

  try {
    const config = await loadConfig();
    const github = config.github;
    if (!github?.connected) {
      return generic;
    }

    if (github.mode === 'app') {
      return [
        'GitHub App is marked connected in config, but the stored app credentials are missing or unreadable.',
        'Reconnect the GitHub App via `pnpm foxfang wizard github` so FoxFang can mint installation tokens again.',
      ].join('\n');
    }

    return [
      'GitHub is marked connected in config, but the stored credential is missing or unreadable.',
      'Reconnect via OAuth, PAT, or the GitHub wizard so the credential store is repopulated.',
    ].join('\n');
  } catch {
    return generic;
  }
}

type GitHubAuthContext = {
  token: string;
  apiBaseUrl?: string;
  mode?: string;
  scopes: string[];
};

type GitHubAuthFailure = {
  success: false;
  error: string;
  output?: string;
  data?: any;
};

async function requireGitHubToken(): Promise<GitHubAuthContext | GitHubAuthFailure> {
  const token = await getGitHubToken();
  if (!token) {
    return {
      success: false,
      error: await buildGitHubReconnectMessage(),
    };
  }

  return {
    token: token.token,
    apiBaseUrl: token.apiBaseUrl,
    mode: token.mode,
    scopes: Array.isArray(token.scopes) ? token.scopes : [],
  };
}

function parseRepo(repoInput: string): OwnerRepo | null {
  return extractOwnerRepo(String(repoInput || '').trim());
}

function normalizePath(path?: string): string {
  return String(path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function normalizeFileTarget(target?: string): string {
  return String(target || '')
    .trim()
    .replace(/^[`'"]+/, '')
    .replace(/[`'",:;.!?)\]]+$/g, '')
    .replace(/^\/+/, '');
}

function looksLikeExactFilename(target?: string): boolean {
  const basename = path.posix.basename(normalizeFileTarget(target));
  return /\.[A-Za-z0-9_.-]+$/.test(basename);
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}

function normalizeComparablePathToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '');
}

function buildRepoTreeCacheKey(params: {
  ownerRepo: OwnerRepo;
  ref?: string;
  apiBaseUrl?: string;
}): string {
  return [
    params.apiBaseUrl || 'default',
    params.ownerRepo.owner,
    params.ownerRepo.repo,
    String(params.ref || '').trim() || 'default',
  ].join(':');
}

async function resolveRepositoryTreeSha(params: {
  ownerRepo: OwnerRepo;
  ref?: string;
  token: string;
  apiBaseUrl?: string;
}): Promise<string | undefined> {
  const desiredRef = String(params.ref || '').trim();
  let commitRef = desiredRef;

  if (!commitRef) {
    const repoInfo = await githubApiRequest(
      `/repos/${params.ownerRepo.owner}/${params.ownerRepo.repo}`,
      { token: params.token, apiBaseUrl: params.apiBaseUrl },
    );
    commitRef = String(repoInfo?.default_branch || '').trim();
  }

  if (!commitRef) {
    return undefined;
  }

  const commit = await githubApiRequest(
    `/repos/${params.ownerRepo.owner}/${params.ownerRepo.repo}/commits/${encodeURIComponent(commitRef)}`,
    { token: params.token, apiBaseUrl: params.apiBaseUrl },
  );

  return typeof commit?.commit?.tree?.sha === 'string' && commit.commit.tree.sha.trim()
    ? commit.commit.tree.sha.trim()
    : undefined;
}

async function getRepositoryTreeEntries(params: {
  ownerRepo: OwnerRepo;
  ref?: string;
  token: string;
  apiBaseUrl?: string;
}): Promise<RepoTreeEntry[]> {
  const cacheKey = buildRepoTreeCacheKey(params);
  const cached = repoTreeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entries;
  }

  const treeSha = await resolveRepositoryTreeSha(params);
  if (!treeSha) {
    return [];
  }

  const tree = await githubApiRequest(
    `/repos/${params.ownerRepo.owner}/${params.ownerRepo.repo}/git/trees/${treeSha}?recursive=1`,
    { token: params.token, apiBaseUrl: params.apiBaseUrl },
  );

  const entries = (Array.isArray(tree?.tree) ? tree.tree : [])
    .map((entry: any) => ({
      path: String(entry?.path || '').trim(),
      type: String(entry?.type || '').trim(),
      size: typeof entry?.size === 'number' ? entry.size : undefined,
    }))
    .filter((entry: RepoTreeEntry) => entry.path && entry.type === 'blob');

  repoTreeCache.set(cacheKey, {
    expiresAt: Date.now() + REPO_TREE_CACHE_TTL_MS,
    entries,
  });

  return entries;
}

function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, Math.max(0, maxLength - 25))}\n\n...[truncated]`,
    truncated: true,
  };
}

function decodeGitHubContent(content?: string, encoding?: string): string {
  if (!content) return '';
  if (encoding === 'base64') {
    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return content;
}

function scoreResolvedFilePath(candidatePath: string, target: string): number {
  const normalizedCandidate = normalizePath(candidatePath).toLowerCase();
  const normalizedTarget = normalizePath(target).toLowerCase();
  const candidateBase = path.posix.basename(normalizedCandidate);
  const targetBase = path.posix.basename(normalizedTarget);
  const candidateStem = stripFileExtension(candidateBase);
  const targetStem = stripFileExtension(targetBase);
  const candidateToken = normalizeComparablePathToken(candidateBase);
  const targetToken = normalizeComparablePathToken(targetBase);
  const candidateStemToken = normalizeComparablePathToken(candidateStem);
  const targetStemToken = normalizeComparablePathToken(targetStem);

  if (normalizedCandidate === normalizedTarget) return 1000;
  if (candidateBase === targetBase && targetBase.includes('.')) return 950;
  if (!targetBase.includes('.') && candidateBase === `${targetBase}.md`) return 910;
  if (normalizedCandidate.endsWith(`/${normalizedTarget}`)) return 920;
  if (candidateBase === targetBase) return 900;
  if (candidateStem === targetStem && targetStem.length >= 3) return 860;
  if (candidateToken === targetToken && targetToken.length >= 3) return 830;
  if (candidateStemToken === targetStemToken && targetStemToken.length >= 3) return 800;
  if (candidateBase.includes(targetBase) && targetBase.length >= 4) return 720;
  if (candidateStem.includes(targetStem) && targetStem.length >= 4) return 680;
  if (normalizedCandidate.includes(normalizedTarget) && normalizedTarget.length >= 4) return 640;
  return 0;
}

function mergeResolvedMatches(matches: ResolvedFileMatch[]): ResolvedFileMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = normalizePath(match.path).toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function chooseResolvedPath(matches: ResolvedFileMatch[], target: string): string | undefined {
  const [top, second] = matches;
  if (!top) {
    return undefined;
  }

  const normalizedTarget = normalizePath(target).toLowerCase();
  const targetBase = path.posix.basename(normalizedTarget);
  const targetHasExtension = looksLikeExactFilename(target);

  if (targetHasExtension) {
    if (top.score >= 900) return top.path;
    if (!second && top.score >= 860) return top.path;
    if (second && top.score >= 900 && top.score >= second.score + 30) return top.path;
    return undefined;
  }

  if (path.posix.basename(top.path).toLowerCase() === `${targetBase}.md`) {
    return top.path;
  }
  if (!second && top.score >= 780) {
    return top.path;
  }
  if (second && top.score >= 860 && top.score >= second.score + 70) {
    return top.path;
  }

  return undefined;
}

async function resolveFileTargetFromTree(params: {
  ownerRepo: OwnerRepo;
  target: string;
  ref?: string;
  token: string;
  apiBaseUrl?: string;
}): Promise<ResolvedFileMatch[]> {
  const entries = await getRepositoryTreeEntries(params);
  return entries
    .map((entry) => ({
      path: entry.path,
      score: scoreResolvedFilePath(entry.path, params.target),
      source: 'tree' as const,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

async function resolveFileTargetFromSearch(params: {
  ownerRepo: OwnerRepo;
  target: string;
  ref?: string;
  token: string;
  apiBaseUrl?: string;
  limit?: number;
}): Promise<ResolvedFileMatch[]> {
  const basename = path.posix.basename(params.target);
  const dirname = path.posix.dirname(params.target);
  const queryParts = [basename || params.target, `repo:${params.ownerRepo.owner}/${params.ownerRepo.repo}`];
  if (looksLikeExactFilename(params.target)) {
    queryParts.push(`filename:${basename}`);
  }
  if (dirname && dirname !== '.' && dirname !== basename) {
    queryParts.push(`path:${dirname}`);
  }

  const perPage = Math.max(5, Math.min(params.limit || 20, 50));
  const result = await githubApiRequest(
    `/search/code?q=${encodeURIComponent(queryParts.join(' '))}&per_page=${perPage}`,
    { token: params.token, apiBaseUrl: params.apiBaseUrl },
  );

  return (Array.isArray(result?.items) ? result.items : [])
    .map((item: any) => ({
      path: String(item?.path || '').trim(),
      url: typeof item?.html_url === 'string' ? item.html_url : undefined,
      source: 'search' as const,
    }))
    .filter((item: { path: string }) => item.path)
    .map((item: { path: string; url?: string; source: 'search' }) => ({
      ...item,
      score: scoreResolvedFilePath(item.path, params.target),
    }))
    .filter((item: ResolvedFileMatch) => item.score > 0)
    .sort((a: ResolvedFileMatch, b: ResolvedFileMatch) => b.score - a.score || a.path.localeCompare(b.path));
}

async function resolveFileTargetToPath(params: {
  ownerRepo: OwnerRepo;
  target: string;
  ref?: string;
  token: string;
  apiBaseUrl?: string;
  limit?: number;
}): Promise<{
  resolvedPath?: string;
  matches: Array<{ path: string; score: number; url?: string; source: 'tree' | 'search' }>;
}> {
  const target = normalizeFileTarget(params.target);
  if (!target) {
    return { matches: [] };
  }
  const treeMatches = await resolveFileTargetFromTree({
    ownerRepo: params.ownerRepo,
    target,
    ref: params.ref,
    token: params.token,
    apiBaseUrl: params.apiBaseUrl,
  }).catch(() => []);

  let mergedMatches = mergeResolvedMatches(treeMatches);
  let resolvedPath = chooseResolvedPath(mergedMatches, target);

  if (!resolvedPath) {
    const searchMatches = await resolveFileTargetFromSearch({
      ownerRepo: params.ownerRepo,
      target,
      ref: params.ref,
      token: params.token,
      apiBaseUrl: params.apiBaseUrl,
      limit: params.limit,
    }).catch(() => []);
    mergedMatches = mergeResolvedMatches([...treeMatches, ...searchMatches])
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    resolvedPath = chooseResolvedPath(mergedMatches, target);
  }

  return {
    resolvedPath,
    matches: mergedMatches.slice(0, 8),
  };
}

function extractReadmeSummarySource(text: string, maxLength: number): string {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*!\[[^\]]*\]\([^)]+\)\s*$/gm, '')
    .replace(/^\s*\[[^\]]+\]\([^)]+\)\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return '';

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const selected: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    const nextTotal = total + paragraph.length + (selected.length > 0 ? 2 : 0);
    if (selected.length > 0 && nextTotal > maxLength) break;
    if (paragraph.length > maxLength && selected.length === 0) {
      return truncateText(paragraph, maxLength).text;
    }
    selected.push(paragraph);
    total = nextTotal;
    if (total >= maxLength) break;
    if (selected.length >= 2) break;
  }

  return truncateText(selected.join('\n\n'), maxLength).text;
}

async function getRepoInfo(ownerRepo: OwnerRepo, token: string, apiBaseUrl?: string): Promise<any> {
  return githubApiRequest(
    `/repos/${ownerRepo.owner}/${ownerRepo.repo}`,
    { token, apiBaseUrl },
  );
}

function hasGitHubPermission(auth: GitHubAuthContext, permission: string, level: 'read' | 'write' = 'read'): boolean {
  const target = `${permission}:${level}`;
  if (auth.scopes.includes(target)) return true;
  if (level === 'read' && auth.scopes.includes(`${permission}:write`)) return true;
  return false;
}

function buildMissingContentsPermissionMessage(repo: OwnerRepo): string {
  return [
    `GitHub is connected and the app can see repo metadata for ${repo.owner}/${repo.repo}, but it does not have repository contents access.`,
    'To read the repo tree, README, and files, grant the GitHub App `Contents: Read-only` permission and ensure the installation still includes this repository.',
  ].join(' ');
}

function isGitHubIntegrationAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource not accessible by integration/i.test(message);
}

export class GitHubGetRepoTool implements Tool {
  name = 'github_get_repo';
  description = `Read a GitHub repository overview via the GitHub API.

Use this for requests like:
- "read this repo"
- "what is this GitHub repo?"
- "summarize https://github.com/owner/repo"
- "show repo metadata / README / default branch"

Default behavior should be lightweight:
- read repo description
- read README and summarize what the project is
- do NOT inspect the codebase, file tree, or language breakdown unless the user explicitly asks

Prefer this over fetch_url for GitHub repository URLs.`;

  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format or full GitHub URL.',
      },
      includeReadme: {
        type: 'boolean',
        description: 'Include README summary source when available.',
        default: true,
      },
      includeLanguages: {
        type: 'boolean',
        description: 'Include language breakdown when available.',
        default: false,
      },
      includeMetadata: {
        type: 'boolean',
        description: 'Include repo metadata like visibility, default branch, stars, and last push time.',
        default: false,
      },
      maxReadmeLength: {
        type: 'number',
        description: 'Maximum README summary-source length in characters.',
        default: 1800,
      },
    },
    required: ['repo'],
  };

  async execute(args: {
    repo: string;
    includeReadme?: boolean;
    includeLanguages?: boolean;
    includeMetadata?: boolean;
    maxReadmeLength?: number;
  }): Promise<ToolResult> {
    try {
      const auth = await requireGitHubToken();
      if ('success' in auth) {
        return auth;
      }

      const ownerRepo = parseRepo(args.repo);
      if (!ownerRepo) {
        return {
          success: false,
          error: `Could not parse owner/repo from: '${args.repo}'`,
        };
      }

      const includeReadme = args.includeReadme !== false;
      const includeLanguages = args.includeLanguages === true;
      const includeMetadata = args.includeMetadata === true;
      const maxReadmeLength = Math.max(500, Math.min(args.maxReadmeLength || 1800, 12000));
      const hasContentsAccess = !(auth.mode === 'app' && !hasGitHubPermission(auth, 'contents', 'read'));

      const [repoInfo, readmeResult, languagesResult] = await Promise.all([
        getRepoInfo(ownerRepo, auth.token, auth.apiBaseUrl),
        includeReadme && hasContentsAccess
          ? githubApiRequest(
              `/repos/${ownerRepo.owner}/${ownerRepo.repo}/readme`,
              { token: auth.token, apiBaseUrl: auth.apiBaseUrl },
            ).catch(() => null)
          : Promise.resolve(null),
        includeLanguages && hasContentsAccess
          ? githubApiRequest(
              `/repos/${ownerRepo.owner}/${ownerRepo.repo}/languages`,
              { token: auth.token, apiBaseUrl: auth.apiBaseUrl },
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      const readmeText = decodeGitHubContent(readmeResult?.content, readmeResult?.encoding).trim();
      const readmeSummarySource = readmeText
        ? extractReadmeSummarySource(readmeText, maxReadmeLength)
        : '';

      const languages = languagesResult && typeof languagesResult === 'object'
        ? Object.entries(languagesResult as Record<string, number>)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 10)
        : [];

      const outputLines = [
        `Repository: ${repoInfo.full_name}`,
        `Description: ${repoInfo.description || 'No description'}`,
      ];

      if (includeMetadata) {
        if (Array.isArray(repoInfo.topics) && repoInfo.topics.length > 0) {
          outputLines.push(`Topics: ${repoInfo.topics.join(', ')}`);
        }
        outputLines.push(`Visibility: ${repoInfo.private ? 'private' : 'public'}`);
        outputLines.push(`Default branch: ${repoInfo.default_branch || 'unknown'}`);
        outputLines.push(`Stars: ${repoInfo.stargazers_count ?? 0}`);
        outputLines.push(`Forks: ${repoInfo.forks_count ?? 0}`);
        outputLines.push(`Open issues: ${repoInfo.open_issues_count ?? 0}`);
        outputLines.push(`Primary language: ${repoInfo.language || 'unknown'}`);
        outputLines.push(`Last push: ${repoInfo.pushed_at || 'unknown'}`);
      }
      if (!hasContentsAccess) {
        outputLines.push('GitHub App contents access: missing');
        outputLines.push(buildMissingContentsPermissionMessage(ownerRepo));
      }
      if (languages.length > 0) {
        outputLines.push(`Languages: ${languages.map(([name, bytes]) => `${name} (${bytes})`).join(', ')}`);
      }
      if (readmeSummarySource) {
        outputLines.push('');
        outputLines.push('README:');
        outputLines.push(readmeSummarySource);
      }

      const overviewData: Record<string, any> = {
        fullName: repoInfo.full_name,
        description: repoInfo.description,
        htmlUrl: repoInfo.html_url,
      };

      if (includeMetadata) {
        if (Array.isArray(repoInfo.topics) && repoInfo.topics.length > 0) {
          overviewData.topics = repoInfo.topics;
        }
        overviewData.private = Boolean(repoInfo.private);
        overviewData.defaultBranch = repoInfo.default_branch;
        overviewData.stars = repoInfo.stargazers_count;
        overviewData.forks = repoInfo.forks_count;
        overviewData.openIssues = repoInfo.open_issues_count;
        overviewData.primaryLanguage = repoInfo.language;
        overviewData.pushedAt = repoInfo.pushed_at;
      }

      return {
        success: true,
        output: outputLines.join('\n'),
        data: {
          repo: overviewData,
          languages: includeLanguages ? Object.fromEntries(languages) : undefined,
          contentsAccess: hasContentsAccess,
          readme: readmeSummarySource || undefined,
          readmeTruncated: Boolean(readmeText && readmeSummarySource && readmeSummarySource.length < readmeText.length),
        },
      };
    } catch (error) {
      if (isGitHubIntegrationAccessError(error)) {
        const ownerRepo = parseRepo(args.repo);
        if (ownerRepo) {
          return {
            success: false,
            error: buildMissingContentsPermissionMessage(ownerRepo),
            data: {
              repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
              reason: 'missing_contents_permission',
            },
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class GitHubListRepoFilesTool implements Tool {
  name = 'github_list_repo_files';
  description = `List files or directories in a GitHub repository path.

Use this for:
- "show the repo structure"
- "list files in src/"
- "what is in the root of this repo?"

Prefer this over scraping the GitHub HTML page.
Use this when the user wants to browse the repo tree or inspect candidate paths returned by \`github_get_file\`.`;

  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format or full GitHub URL.',
      },
      path: {
        type: 'string',
        description: 'Optional directory path inside the repository. Defaults to root.',
      },
      ref: {
        type: 'string',
        description: 'Optional git ref, tag, or branch name.',
      },
      limit: {
        type: 'number',
        description: 'Maximum entries to return.',
        default: 100,
      },
    },
    required: ['repo'],
  };

  async execute(args: {
    repo: string;
    path?: string;
    ref?: string;
    limit?: number;
  }): Promise<ToolResult> {
    try {
      const auth = await requireGitHubToken();
      if ('success' in auth) {
        return auth;
      }

      const ownerRepo = parseRepo(args.repo);
      if (!ownerRepo) {
        return {
          success: false,
          error: `Could not parse owner/repo from: '${args.repo}'`,
        };
      }

      if (auth.mode === 'app' && !hasGitHubPermission(auth, 'contents', 'read')) {
        return {
          success: false,
          error: buildMissingContentsPermissionMessage(ownerRepo),
          data: {
            repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
            reason: 'missing_contents_permission',
          },
        };
      }

      const path = normalizePath(args.path);
      const limit = Math.max(1, Math.min(args.limit || 100, 300));
      const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
      const endpointPath = path ? `/${path}` : '';
      const response = await githubApiRequest(
        `/repos/${ownerRepo.owner}/${ownerRepo.repo}/contents${endpointPath}${query}`,
        { token: auth.token, apiBaseUrl: auth.apiBaseUrl },
      );

      const entries = Array.isArray(response) ? response : [response];
      const normalizedEntries = entries
        .map((entry: any) => ({
          name: entry.name,
          path: entry.path,
          type: entry.type,
          size: entry.size,
          url: entry.html_url,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'dir' ? -1 : 1;
          }
          return String(a.path || '').localeCompare(String(b.path || ''));
        })
        .slice(0, limit);

      return {
        success: true,
        output: [
          `Repository: ${ownerRepo.owner}/${ownerRepo.repo}`,
          `Path: ${path || '.'}`,
          '',
          ...normalizedEntries.map((entry) => {
            const sizePart = typeof entry.size === 'number' ? ` (${entry.size} bytes)` : '';
            return `${entry.type === 'dir' ? '[dir]' : '[file]'} ${entry.path}${sizePart}`;
          }),
        ].join('\n'),
        data: {
          repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
          path: path || '',
          entries: normalizedEntries,
        },
      };
    } catch (error) {
      if (isGitHubIntegrationAccessError(error)) {
        const ownerRepo = parseRepo(args.repo);
        if (ownerRepo) {
          return {
            success: false,
            error: buildMissingContentsPermissionMessage(ownerRepo),
            data: {
              repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
              reason: 'missing_contents_permission',
            },
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class GitHubGetFileTool implements Tool {
  name = 'github_get_file';
  description = `Read a file from a GitHub repository via the GitHub API.

Use this for:
- "open package.json"
- "read README.md"
- "show src/index.ts"
- "what is in this file?"

This tool can read by:
- exact path (\`path\`)
- filename or file hint (\`target\`), which FoxFang resolves against the actual repo tree before reading.

When the user names a file without an exact path, pass that filename as \`target\` exactly as the user said it.`;

  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format or full GitHub URL.',
      },
      path: {
        type: 'string',
        description: 'File path inside the repository.',
      },
      target: {
        type: 'string',
        description: 'Optional filename or partial file hint to resolve when the exact path is unknown.',
      },
      ref: {
        type: 'string',
        description: 'Optional git ref, tag, or branch name.',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum file content length to return.',
        default: 12000,
      },
    },
    required: ['repo'],
  };

  async execute(args: {
    repo: string;
    path?: string;
    target?: string;
    ref?: string;
    maxLength?: number;
  }): Promise<ToolResult> {
    try {
      const auth = await requireGitHubToken();
      if ('success' in auth) {
        return auth;
      }

      const ownerRepo = parseRepo(args.repo);
      if (!ownerRepo) {
        return {
          success: false,
          error: `Could not parse owner/repo from: '${args.repo}'`,
        };
      }

      if (auth.mode === 'app' && !hasGitHubPermission(auth, 'contents', 'read')) {
        return {
          success: false,
          error: buildMissingContentsPermissionMessage(ownerRepo),
          data: {
            repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
            reason: 'missing_contents_permission',
          },
        };
      }

      let path = normalizePath(args.path);
      const target = normalizeFileTarget(args.target);
      let targetMatches: Array<{ path: string; score: number; url?: string; source: 'tree' | 'search' }> = [];
      if (!path && target) {
        const resolved = await resolveFileTargetToPath({
          ownerRepo,
          target,
          ref: args.ref,
          token: auth.token,
          apiBaseUrl: auth.apiBaseUrl,
        });
        path = resolved.resolvedPath || '';
        targetMatches = resolved.matches;
      }

      if (!path) {
        return {
          success: false,
          error: target
            ? `Could not resolve file target "${target}" in ${ownerRepo.owner}/${ownerRepo.repo}.`
            : 'File path or target is required. Provide an exact path, or pass a filename/target to resolve.',
          data: targetMatches.length > 0
            ? {
                repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
                target,
                matches: targetMatches,
              }
            : undefined,
        };
      }

      const maxLength = Math.max(500, Math.min(args.maxLength || 12000, 50000));
      const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
      const file = await githubApiRequest(
        `/repos/${ownerRepo.owner}/${ownerRepo.repo}/contents/${path}${query}`,
        { token: auth.token, apiBaseUrl: auth.apiBaseUrl },
      );

      if (Array.isArray(file) || file?.type === 'dir') {
        return {
          success: false,
          error: `Path is a directory, not a file: ${path}`,
        };
      }

      const decoded = decodeGitHubContent(file?.content, file?.encoding);
      const truncated = truncateText(decoded, maxLength);

      return {
        success: true,
        output: `File: ${file.path}\nSHA: ${file.sha}\nSize: ${file.size || 0} bytes\n\n${truncated.text}`,
        data: {
          repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
          path: file.path,
          target: target || undefined,
          resolvedFromTarget: Boolean(target && file.path !== target),
          matches: targetMatches.length > 0 ? targetMatches : undefined,
          sha: file.sha,
          size: file.size,
          content: truncated.text,
          truncated: truncated.truncated,
          htmlUrl: file.html_url,
        },
      };
    } catch (error) {
      if (isGitHubIntegrationAccessError(error)) {
        const ownerRepo = parseRepo(args.repo);
        if (ownerRepo) {
          return {
            success: false,
            error: buildMissingContentsPermissionMessage(ownerRepo),
            data: {
              repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
              reason: 'missing_contents_permission',
            },
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class GitHubSearchCodeTool implements Tool {
  name = 'github_search_code';
  description = `Search code inside a GitHub repository via the GitHub API.

Use this for:
- "find auth middleware"
- "search for env var usage"
- "where is this function defined?"
- "find files mentioning X"

Use this for explicit search/find/grep questions, not as the first step for reading a named file.`;

  category = ToolCategory.EXTERNAL;
  parameters = {
    type: 'object' as const,
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format or full GitHub URL.',
      },
      query: {
        type: 'string',
        description: 'Search query, symbol name, keyword, or phrase.',
      },
      path: {
        type: 'string',
        description: 'Optional subdirectory restriction.',
      },
      filename: {
        type: 'string',
        description: 'Optional filename filter.',
      },
      extension: {
        type: 'string',
        description: 'Optional extension filter without dot, e.g. ts or md.',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return.',
        default: 10,
      },
    },
    required: ['repo', 'query'],
  };

  async execute(args: {
    repo: string;
    query: string;
    path?: string;
    filename?: string;
    extension?: string;
    limit?: number;
  }): Promise<ToolResult> {
    try {
      const auth = await requireGitHubToken();
      if ('success' in auth) {
        return auth;
      }

      const ownerRepo = parseRepo(args.repo);
      if (!ownerRepo) {
        return {
          success: false,
          error: `Could not parse owner/repo from: '${args.repo}'`,
        };
      }

      if (auth.mode === 'app' && !hasGitHubPermission(auth, 'contents', 'read')) {
        return {
          success: false,
          error: buildMissingContentsPermissionMessage(ownerRepo),
          data: {
            repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
            reason: 'missing_contents_permission',
          },
        };
      }

      const query = String(args.query || '').trim();
      if (!query) {
        return {
          success: false,
          error: 'Search query is required',
        };
      }

      const limit = Math.max(1, Math.min(args.limit || 10, 50));
      const queryParts = [query, `repo:${ownerRepo.owner}/${ownerRepo.repo}`];
      if (args.path?.trim()) queryParts.push(`path:${args.path.trim()}`);
      if (args.filename?.trim()) queryParts.push(`filename:${args.filename.trim()}`);
      if (args.extension?.trim()) queryParts.push(`extension:${args.extension.trim().replace(/^\./, '')}`);

      const result = await githubApiRequest(
        `/search/code?q=${encodeURIComponent(queryParts.join(' '))}&per_page=${limit}`,
        { token: auth.token, apiBaseUrl: auth.apiBaseUrl },
      );

      const items = Array.isArray(result?.items) ? result.items : [];
      const summary = items.slice(0, limit).map((item: any) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.html_url,
        repository: item.repository?.full_name,
      }));

      if (summary.length === 0) {
        return {
          success: true,
          output: `No code matches found for "${query}" in ${ownerRepo.owner}/${ownerRepo.repo}.`,
          data: {
            totalCount: result?.total_count || 0,
            items: [],
          },
        };
      }

      return {
        success: true,
        output: [
          `Found ${summary.length} result(s) for "${query}" in ${ownerRepo.owner}/${ownerRepo.repo}:`,
          '',
          ...summary.map((item: { path: string; url: string }) => `${item.path}\n${item.url}`),
        ].join('\n'),
        data: {
          totalCount: result?.total_count || summary.length,
          items: summary,
        },
      };
    } catch (error) {
      if (isGitHubIntegrationAccessError(error)) {
        const ownerRepo = parseRepo(args.repo);
        if (ownerRepo) {
          return {
            success: false,
            error: buildMissingContentsPermissionMessage(ownerRepo),
            data: {
              repo: `${ownerRepo.owner}/${ownerRepo.repo}`,
              reason: 'missing_contents_permission',
            },
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
