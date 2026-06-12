import { fetchGitHubRepo } from './providers/github.js';
import { fetchNpmPackage } from './providers/npm.js';
import { scoreRisk } from './scoring.js';
import { normalizeTarget, parseGitHubRepoUrl } from './target.js';
import type { CheckOptions, GitHubRepoInfo, NpmPackageInfo, RiskReport } from './types.js';

export async function checkTarget(input: string, options: CheckOptions = {}): Promise<RiskReport> {
  const target = normalizeTarget(input);
  const errors: string[] = [];
  let npm: NpmPackageInfo | undefined;
  let github: GitHubRepoInfo | undefined;

  if (target.kind === 'npm') {
    npm = await fetchNpmPackage(target.name);
    if (!npm) {
      errors.push(`No exact npm package found for "${target.name}".`);
    }

    const repoFromPackage = npm?.repositoryUrl ? parseGitHubRepoUrl(npm.repositoryUrl) : undefined;
    if (repoFromPackage) {
      try {
        github = await fetchGitHubRepo(repoFromPackage.owner, repoFromPackage.repo);
      } catch (error) {
        errors.push(formatError(error));
      }
    }
  } else if (target.owner && target.repo) {
    github = await fetchGitHubRepo(target.owner, target.repo);
    if (!github) {
      errors.push(`No GitHub repository found for "${target.name}".`);
    }
  }

  const scored = scoreRisk({
    npm,
    github,
    now: options.now ?? new Date()
  });

  return {
    schemaVersion: '1.0',
    target,
    generatedAt: (options.now ?? new Date()).toISOString(),
    ...scored,
    sources: {
      npm,
      github
    },
    errors
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
