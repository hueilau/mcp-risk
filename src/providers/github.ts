import { z } from 'zod';
import type { GitHubRepoInfo } from '../types.js';

const githubRepoSchema = z.object({
  full_name: z.string(),
  name: z.string(),
  owner: z.object({
    login: z.string()
  }),
  html_url: z.string(),
  description: z.string().nullable(),
  homepage: z.string().nullable(),
  language: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  watchers_count: z.number(),
  archived: z.boolean(),
  disabled: z.boolean(),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string().nullable(),
  topics: z.array(z.string()).optional(),
  license: z
    .object({
      spdx_id: z.string().nullable()
    })
    .nullable()
});

export async function fetchGitHubRepo(owner: string, repo: string): Promise<GitHubRepoInfo | undefined> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'mcp-risk',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`GitHub request failed with HTTP ${response.status}: ${owner}/${repo}`);
  }

  const parsed = githubRepoSchema.parse(await response.json());

  return {
    owner: parsed.owner.login,
    repo: parsed.name,
    fullName: parsed.full_name,
    description: parsed.description ?? undefined,
    url: parsed.html_url,
    homepageUrl: parsed.homepage ?? undefined,
    language: parsed.language ?? undefined,
    license: parsed.license?.spdx_id ?? undefined,
    stars: parsed.stargazers_count,
    forks: parsed.forks_count,
    openIssues: parsed.open_issues_count,
    watchers: parsed.watchers_count,
    archived: parsed.archived,
    disabled: parsed.disabled,
    isFork: parsed.fork,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    pushedAt: parsed.pushed_at ?? undefined,
    topics: parsed.topics ?? []
  };
}
