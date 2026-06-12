import type { NormalizedTarget } from './types.js';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export function normalizeTarget(input: string): NormalizedTarget {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Target is required.');
  }

  const fromUrl = normalizeUrlTarget(trimmed);
  if (fromUrl) {
    return fromUrl;
  }

  const ownerRepo = parseOwnerRepo(trimmed);
  if (ownerRepo) {
    return {
      kind: 'github',
      input: trimmed,
      name: ownerRepo.fullName,
      owner: ownerRepo.owner,
      repo: ownerRepo.repo
    };
  }

  return {
    kind: 'npm',
    input: trimmed,
    name: trimmed
  };
}

export function parseGitHubRepoUrl(raw: string): { owner: string; repo: string; fullName: string } | undefined {
  const normalized = raw.replace(/^git\+/, '').replace(/\.git$/, '');
  try {
    const url = new URL(normalized);
    if (!GITHUB_HOSTS.has(url.hostname)) {
      return undefined;
    }

    const [owner, repo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repo) {
      return undefined;
    }

    return { owner, repo, fullName: `${owner}/${repo}` };
  } catch {
    return undefined;
  }
}

function normalizeUrlTarget(input: string): NormalizedTarget | undefined {
  const repo = parseGitHubRepoUrl(input);
  if (!repo) {
    return undefined;
  }

  return {
    kind: 'github',
    input,
    name: repo.fullName,
    owner: repo.owner,
    repo: repo.repo
  };
}

function parseOwnerRepo(input: string): { owner: string; repo: string; fullName: string } | undefined {
  if (input.startsWith('@')) {
    return undefined;
  }

  const parts = input.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return undefined;
  }

  if (parts.some((part) => part.includes(' ') || part.startsWith('.'))) {
    return undefined;
  }

  return { owner: parts[0], repo: parts[1], fullName: input };
}
