export type TargetKind = 'npm' | 'github';

export interface NormalizedTarget {
  kind: TargetKind;
  input: string;
  name: string;
  owner?: string;
  repo?: string;
}

export interface NpmPackageInfo {
  name: string;
  version: string;
  description?: string;
  license?: string;
  keywords: string[];
  repositoryUrl?: string;
  bugsUrl?: string;
  homepageUrl?: string;
  publisher?: string;
  maintainers: string[];
  publishedAt?: string;
  weeklyDownloads?: number;
  monthlyDownloads?: number;
  dependents?: number;
  npmScore?: {
    final?: number;
    popularity?: number;
    quality?: number;
    maintenance?: number;
  };
  insecure?: boolean;
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  description?: string;
  url: string;
  homepageUrl?: string;
  language?: string;
  license?: string;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  archived: boolean;
  disabled: boolean;
  isFork: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt?: string;
  topics: string[];
}

export interface CheckEvidence {
  label: string;
  value: string | number | boolean | null;
}

export interface ScoreRule {
  id: string;
  title: string;
  category: 'maintenance' | 'adoption' | 'hygiene' | 'security';
  points: number;
  maxPoints: number;
  summary: string;
  evidence: CheckEvidence[];
}

export interface RiskReport {
  schemaVersion: '1.0';
  target: NormalizedTarget;
  generatedAt: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: string;
  summary: string[];
  rules: ScoreRule[];
  sources: {
    npm?: NpmPackageInfo;
    github?: GitHubRepoInfo;
  };
  errors: string[];
}

export interface CheckOptions {
  now?: Date;
}
