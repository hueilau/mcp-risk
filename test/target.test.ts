import { describe, expect, it } from 'vitest';
import { normalizeTarget, parseGitHubRepoUrl } from '../src/target.js';

describe('normalizeTarget', () => {
  it('detects npm package names', () => {
    expect(normalizeTarget('@playwright/mcp')).toMatchObject({
      kind: 'npm',
      name: '@playwright/mcp'
    });
  });

  it('detects owner/repo shorthand', () => {
    expect(normalizeTarget('ChromeDevTools/chrome-devtools-mcp')).toMatchObject({
      kind: 'github',
      owner: 'ChromeDevTools',
      repo: 'chrome-devtools-mcp'
    });
  });

  it('detects GitHub URLs', () => {
    expect(normalizeTarget('https://github.com/ChromeDevTools/chrome-devtools-mcp')).toMatchObject({
      kind: 'github',
      owner: 'ChromeDevTools',
      repo: 'chrome-devtools-mcp'
    });
  });
});

describe('parseGitHubRepoUrl', () => {
  it('normalizes git repository URLs', () => {
    expect(parseGitHubRepoUrl('git+https://github.com/ChromeDevTools/chrome-devtools-mcp.git')).toEqual({
      owner: 'ChromeDevTools',
      repo: 'chrome-devtools-mcp',
      fullName: 'ChromeDevTools/chrome-devtools-mcp'
    });
  });
});
