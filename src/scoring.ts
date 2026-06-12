import type { GitHubRepoInfo, NpmPackageInfo, RiskReport, ScoreRule } from './types.js';

interface ScoreInput {
  npm?: NpmPackageInfo;
  github?: GitHubRepoInfo;
  now: Date;
}

export function scoreRisk(input: ScoreInput): Pick<RiskReport, 'score' | 'grade' | 'verdict' | 'summary' | 'rules'> {
  const rules = [
    scoreMaintenance(input),
    scoreAdoption(input),
    scorePackageHygiene(input),
    scoreSecurityPosture(input)
  ];
  const maxPoints = rules.reduce((sum, rule) => sum + rule.maxPoints, 0);
  const earnedPoints = rules.reduce((sum, rule) => sum + rule.points, 0);
  const score = Math.max(0, Math.min(100, Math.round((earnedPoints / maxPoints) * 100)));
  const grade = gradeForScore(score);

  return {
    score,
    grade,
    verdict: verdictForGrade(grade),
    summary: buildSummary(score, rules),
    rules
  };
}

export function gradeForScore(score: number): RiskReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scoreMaintenance(input: ScoreInput): ScoreRule {
  const maxPoints = 30;
  const dates = [
    input.npm?.publishedAt ? new Date(input.npm.publishedAt) : undefined,
    input.github?.pushedAt ? new Date(input.github.pushedAt) : undefined,
    input.github?.updatedAt ? new Date(input.github.updatedAt) : undefined
  ].filter(isValidDate);
  const newestActivity = dates.sort((a, b) => b.getTime() - a.getTime())[0];
  const daysSinceActivity = newestActivity ? daysBetween(newestActivity, input.now) : undefined;

  let points = 0;
  let summary = 'No recent maintenance signal found.';

  if (input.github?.archived || input.github?.disabled) {
    points = 0;
    summary = 'Repository is archived or disabled.';
  } else if (daysSinceActivity === undefined) {
    points = 6;
  } else if (daysSinceActivity <= 30) {
    points = 30;
    summary = 'Recent package or repository activity.';
  } else if (daysSinceActivity <= 90) {
    points = 24;
    summary = 'Activity is reasonably recent.';
  } else if (daysSinceActivity <= 180) {
    points = 17;
    summary = 'Activity is starting to look stale.';
  } else if (daysSinceActivity <= 365) {
    points = 10;
    summary = 'Activity is stale.';
  } else {
    points = 3;
    summary = 'No meaningful activity in over a year.';
  }

  return {
    id: 'maintenance.recency',
    title: 'Maintenance recency',
    category: 'maintenance',
    points,
    maxPoints,
    summary,
    evidence: [
      { label: 'newest_activity_days_ago', value: daysSinceActivity ?? null },
      { label: 'npm_published_at', value: input.npm?.publishedAt ?? null },
      { label: 'github_pushed_at', value: input.github?.pushedAt ?? null },
      { label: 'github_archived', value: input.github?.archived ?? null },
      { label: 'github_disabled', value: input.github?.disabled ?? null }
    ]
  };
}

function scoreAdoption(input: ScoreInput): ScoreRule {
  const maxPoints = 25;
  const weeklyDownloads = input.npm?.weeklyDownloads ?? 0;
  const stars = input.github?.stars ?? 0;
  const forks = input.github?.forks ?? 0;
  const dependents = input.npm?.dependents ?? 0;

  const points = Math.min(
    maxPoints,
    downloadPoints(weeklyDownloads) + starPoints(stars) + forkPoints(forks) + dependentPoints(dependents)
  );

  return {
    id: 'adoption.external-usage',
    title: 'External adoption',
    category: 'adoption',
    points,
    maxPoints,
    summary:
      points >= 20
        ? 'Strong public adoption signals.'
        : points >= 12
          ? 'Some public adoption signals.'
          : 'Limited public adoption evidence.',
    evidence: [
      { label: 'weekly_downloads', value: weeklyDownloads || null },
      { label: 'github_stars', value: stars || null },
      { label: 'github_forks', value: forks || null },
      { label: 'npm_dependents', value: dependents || null }
    ]
  };
}

function scorePackageHygiene(input: ScoreInput): ScoreRule {
  const maxPoints = 25;
  let points = 0;
  const evidence = [
    { label: 'license', value: input.npm?.license ?? input.github?.license ?? null },
    { label: 'repository_url', value: input.npm?.repositoryUrl ?? input.github?.url ?? null },
    { label: 'bugs_url', value: input.npm?.bugsUrl ?? null },
    { label: 'description_present', value: Boolean(input.npm?.description ?? input.github?.description) },
    { label: 'keywords_count', value: input.npm?.keywords.length ?? input.github?.topics.length ?? 0 },
    { label: 'maintainers_count', value: input.npm?.maintainers.length ?? null }
  ];

  if (input.npm?.license || input.github?.license) points += 6;
  if (input.npm?.repositoryUrl || input.github?.url) points += 6;
  if (input.npm?.bugsUrl || input.github?.openIssues !== undefined) points += 4;
  if (input.npm?.description || input.github?.description) points += 4;
  if ((input.npm?.keywords.length ?? input.github?.topics.length ?? 0) > 0) points += 3;
  if ((input.npm?.maintainers.length ?? 0) > 0 || input.github) points += 2;

  return {
    id: 'hygiene.metadata',
    title: 'Metadata hygiene',
    category: 'hygiene',
    points,
    maxPoints,
    summary:
      points >= 20
        ? 'Metadata is clear enough to audit.'
        : points >= 12
          ? 'Metadata is usable but incomplete.'
          : 'Metadata is sparse or hard to audit.',
    evidence
  };
}

function scoreSecurityPosture(input: ScoreInput): ScoreRule {
  const maxPoints = 20;
  let points = maxPoints;
  const findings: string[] = [];

  if (input.npm?.insecure) {
    points -= 10;
    findings.push('npm marked this package insecure');
  }

  if (!(input.npm?.license || input.github?.license)) {
    points -= 4;
    findings.push('license is missing');
  }

  if (input.github?.isFork && (input.github.stars < 50 || input.github.forks < 10)) {
    points -= 3;
    findings.push('low-signal fork');
  }

  if (input.npm && !input.npm.repositoryUrl) {
    points -= 3;
    findings.push('npm package has no repository link');
  }

  if (input.github?.openIssues !== undefined && input.github.stars > 0 && input.github.openIssues / input.github.stars > 0.5) {
    points -= 2;
    findings.push('issue count is high relative to stars');
  }

  points = Math.max(0, points);

  return {
    id: 'security.obvious-risk-signals',
    title: 'Obvious risk signals',
    category: 'security',
    points,
    maxPoints,
    summary: findings.length === 0 ? 'No obvious metadata-level risk flags.' : findings.join('; '),
    evidence: [
      { label: 'npm_insecure_flag', value: input.npm?.insecure ?? null },
      { label: 'license_present', value: Boolean(input.npm?.license ?? input.github?.license) },
      { label: 'github_is_fork', value: input.github?.isFork ?? null },
      { label: 'github_open_issues', value: input.github?.openIssues ?? null },
      { label: 'repository_url', value: input.npm?.repositoryUrl ?? input.github?.url ?? null }
    ]
  };
}

function downloadPoints(downloads: number): number {
  if (downloads >= 100_000) return 10;
  if (downloads >= 10_000) return 8;
  if (downloads >= 1_000) return 5;
  if (downloads >= 100) return 3;
  if (downloads > 0) return 1;
  return 0;
}

function starPoints(stars: number): number {
  if (stars >= 10_000) return 12;
  if (stars >= 1_000) return 9;
  if (stars >= 100) return 6;
  if (stars >= 10) return 3;
  if (stars > 0) return 1;
  return 0;
}

function forkPoints(forks: number): number {
  if (forks >= 1_000) return 6;
  if (forks >= 100) return 4;
  if (forks >= 10) return 2;
  if (forks > 0) return 1;
  return 0;
}

function dependentPoints(dependents: number): number {
  if (dependents >= 100) return 3;
  if (dependents >= 10) return 2;
  if (dependents > 0) return 1;
  return 0;
}

function buildSummary(score: number, rules: ScoreRule[]): string[] {
  const weakest = [...rules].sort((a, b) => a.points / a.maxPoints - b.points / b.maxPoints)[0];
  const strongest = [...rules].sort((a, b) => b.points / b.maxPoints - a.points / a.maxPoints)[0];

  return [
    `Overall score is ${score}/100.`,
    `Strongest area: ${strongest.title} (${strongest.points}/${strongest.maxPoints}).`,
    `Weakest area: ${weakest.title} (${weakest.points}/${weakest.maxPoints}).`
  ];
}

function verdictForGrade(grade: RiskReport['grade']): string {
  switch (grade) {
    case 'A':
      return 'Low visible metadata risk.';
    case 'B':
      return 'Generally healthy, with minor gaps.';
    case 'C':
      return 'Usable, but review before trusting.';
    case 'D':
      return 'Risky; investigate before installing.';
    case 'F':
      return 'High visible metadata risk.';
  }
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
