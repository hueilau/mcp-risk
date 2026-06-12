import { z } from 'zod';
import type { NpmPackageInfo } from '../types.js';

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const NPM_DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point';

const searchResponseSchema = z.object({
  objects: z.array(
    z.object({
      downloads: z
        .object({
          weekly: z.number().optional(),
          monthly: z.number().optional()
        })
        .optional(),
      dependents: z.union([z.number(), z.string()]).optional(),
      package: z.object({
        name: z.string(),
        version: z.string(),
        description: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        license: z.string().optional(),
        date: z.string().optional(),
        publisher: z
          .object({
            username: z.string().optional()
          })
          .optional(),
        maintainers: z
          .array(
            z.object({
              username: z.string().optional()
            })
          )
          .optional(),
        links: z
          .object({
            homepage: z.string().optional(),
            repository: z.string().optional(),
            bugs: z.string().optional(),
            npm: z.string().optional()
          })
          .optional()
      }),
      score: z
        .object({
          final: z.number().optional(),
          detail: z
            .object({
              popularity: z.number().optional(),
              quality: z.number().optional(),
              maintenance: z.number().optional()
            })
            .optional()
        })
        .optional(),
      flags: z
        .object({
          insecure: z.number().optional()
        })
        .optional()
    })
  )
});

const downloadsSchema = z.object({
  downloads: z.number()
});

export async function fetchNpmPackage(packageName: string): Promise<NpmPackageInfo | undefined> {
  const searchUrl = new URL(NPM_SEARCH_URL);
  searchUrl.searchParams.set('text', packageName);
  searchUrl.searchParams.set('size', '10');

  const searchResponse = await fetchJson(searchUrl);
  if (searchResponse.status === 404) {
    return undefined;
  }

  const parsed = searchResponseSchema.parse(searchResponse.data);
  const exactMatch = parsed.objects.find((entry) => entry.package.name === packageName);
  if (!exactMatch) {
    return undefined;
  }

  const [weeklyDownloads, monthlyDownloads] = await Promise.all([
    fetchDownloads(packageName, 'last-week', exactMatch.downloads?.weekly),
    fetchDownloads(packageName, 'last-month', exactMatch.downloads?.monthly)
  ]);

  return {
    name: exactMatch.package.name,
    version: exactMatch.package.version,
    description: exactMatch.package.description,
    license: exactMatch.package.license,
    keywords: exactMatch.package.keywords ?? [],
    repositoryUrl: normalizeRepositoryUrl(exactMatch.package.links?.repository),
    bugsUrl: exactMatch.package.links?.bugs,
    homepageUrl: exactMatch.package.links?.homepage,
    publisher: exactMatch.package.publisher?.username,
    maintainers: exactMatch.package.maintainers?.map((maintainer) => maintainer.username).filter(isString) ?? [],
    publishedAt: exactMatch.package.date,
    weeklyDownloads,
    monthlyDownloads,
    dependents: parseDependents(exactMatch.dependents),
    npmScore: {
      final: exactMatch.score?.final,
      popularity: exactMatch.score?.detail?.popularity,
      quality: exactMatch.score?.detail?.quality,
      maintenance: exactMatch.score?.detail?.maintenance
    },
    insecure: exactMatch.flags?.insecure === 1
  };
}

async function fetchDownloads(packageName: string, range: 'last-week' | 'last-month', fallback?: number): Promise<number | undefined> {
  const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@');
  const url = `${NPM_DOWNLOADS_URL}/${range}/${encodedName}`;
  try {
    const response = await fetchJson(new URL(url));
    if (response.status === 404) {
      return fallback;
    }

    return downloadsSchema.parse(response.data).downloads;
  } catch {
    return fallback;
  }
}

async function fetchJson(url: URL): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'mcp-risk'
    }
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`npm request failed with HTTP ${response.status}: ${url.toString()}`);
  }

  const data = response.status === 404 ? {} : await response.json();
  return { status: response.status, data };
}

function parseDependents(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace(/,/g, ''), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function normalizeRepositoryUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
