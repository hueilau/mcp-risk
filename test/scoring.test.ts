import { describe, expect, it } from 'vitest';
import { scoreRisk } from '../src/scoring.js';
import type { GitHubRepoInfo, NpmPackageInfo } from '../src/types.js';

const now = new Date('2026-06-12T12:00:00Z');

describe('scoreRisk', () => {
  it('scores a fresh, adopted package as low visible risk', () => {
    const report = scoreRisk({
      now,
      npm: npmPackage({
        publishedAt: '2026-06-11T12:00:00Z',
        weeklyDownloads: 2500000,
        license: 'Apache-2.0',
        repositoryUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
        bugsUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp/issues',
        keywords: ['mcp', 'chrome']
      }),
      github: githubRepo({
        stars: 43000,
        forks: 2700,
        pushedAt: '2026-06-11T12:00:00Z'
      })
    });

    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe('A');
  });

  it('penalizes missing license and sparse metadata', () => {
    const report = scoreRisk({
      now,
      npm: npmPackage({
        license: undefined,
        repositoryUrl: undefined,
        bugsUrl: undefined,
        keywords: [],
        maintainers: []
      })
    });

    expect(report.score).toBeLessThan(70);
    expect(report.rules.find((rule) => rule.id === 'security.obvious-risk-signals')?.summary).toContain('license is missing');
  });

  it('penalizes archived GitHub repositories', () => {
    const report = scoreRisk({
      now,
      github: githubRepo({
        archived: true,
        pushedAt: '2026-06-11T12:00:00Z'
      })
    });

    const maintenance = report.rules.find((rule) => rule.id === 'maintenance.recency');
    expect(maintenance?.points).toBe(0);
    expect(maintenance?.summary).toContain('archived');
  });

  it('scores stale low-adoption packages as risky', () => {
    const report = scoreRisk({
      now,
      npm: npmPackage({
        publishedAt: '2024-01-01T00:00:00Z',
        weeklyDownloads: 2,
        license: 'MIT',
        repositoryUrl: 'https://github.com/example/old-mcp',
        bugsUrl: undefined,
        keywords: []
      }),
      github: githubRepo({
        stars: 3,
        forks: 0,
        updatedAt: '2024-01-01T00:00:00Z',
        pushedAt: '2024-01-01T00:00:00Z'
      })
    });

    expect(report.score).toBeLessThan(60);
    expect(['D', 'F']).toContain(report.grade);
  });
});

function npmPackage(overrides: Partial<NpmPackageInfo> = {}): NpmPackageInfo {
  return {
    name: 'sample-mcp',
    version: '1.0.0',
    description: 'Sample MCP server',
    license: 'MIT',
    keywords: ['mcp'],
    repositoryUrl: 'https://github.com/example/sample-mcp',
    bugsUrl: 'https://github.com/example/sample-mcp/issues',
    homepageUrl: undefined,
    publisher: 'example',
    maintainers: ['example'],
    publishedAt: '2026-06-01T00:00:00Z',
    weeklyDownloads: 1000,
    monthlyDownloads: 4000,
    dependents: 1,
    insecure: false,
    ...overrides
  };
}

function githubRepo(overrides: Partial<GitHubRepoInfo> = {}): GitHubRepoInfo {
  return {
    owner: 'example',
    repo: 'sample-mcp',
    fullName: 'example/sample-mcp',
    description: 'Sample MCP server',
    url: 'https://github.com/example/sample-mcp',
    homepageUrl: undefined,
    language: 'TypeScript',
    license: 'MIT',
    stars: 100,
    forks: 20,
    openIssues: 4,
    watchers: 100,
    archived: false,
    disabled: false,
    isFork: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    pushedAt: '2026-06-01T00:00:00Z',
    topics: ['mcp'],
    ...overrides
  };
}
