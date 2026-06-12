import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGitHubRepo } from '../src/providers/github.js';
import { fetchNpmPackage } from '../src/providers/npm.js';

const fixtureDir = join(import.meta.dirname, 'fixtures');

describe('providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses npm package search and download fixtures', async () => {
    const search = await fixture('npm-search-chrome-devtools-mcp.json');
    const week = await fixture('npm-downloads-week.json');
    const month = await fixture('npm-downloads-month.json');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(search))
      .mockResolvedValueOnce(jsonResponse(week))
      .mockResolvedValueOnce(jsonResponse(month));

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchNpmPackage('chrome-devtools-mcp');

    expect(result).toMatchObject({
      name: 'chrome-devtools-mcp',
      license: 'Apache-2.0',
      repositoryUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
      weeklyDownloads: 2549079,
      monthlyDownloads: 10000000,
      dependents: 32,
      insecure: false
    });
  });

  it('parses GitHub repo fixtures', async () => {
    const repo = await fixture('github-chrome-devtools-mcp.json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(repo)));

    const result = await fetchGitHubRepo('ChromeDevTools', 'chrome-devtools-mcp');

    expect(result).toMatchObject({
      fullName: 'ChromeDevTools/chrome-devtools-mcp',
      license: 'Apache-2.0',
      stars: 43435,
      forks: 2783,
      archived: false
    });
  });
});

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(fixtureDir, name), 'utf8'));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}
