import type { RiskReport, ScoreRule } from './types.js';

export function renderHumanReport(report: RiskReport): string {
  const lines = [
    `mcp-risk report for ${report.target.name}`,
    '',
    `Score: ${report.score}/100 (${report.grade})`,
    `Verdict: ${report.verdict}`,
    '',
    'Summary:',
    ...report.summary.map((line) => `  - ${line}`),
    '',
    'Evidence:'
  ];

  for (const rule of report.rules) {
    lines.push(renderRule(rule));
  }

  if (report.errors.length > 0) {
    lines.push('', 'Warnings:', ...report.errors.map((error) => `  - ${error}`));
  }

  return lines.join('\n');
}

export function renderQuietReport(report: RiskReport): string {
  return `${report.score} ${report.grade} ${report.verdict}`;
}

export function renderJsonReport(report: RiskReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function renderRule(rule: ScoreRule): string {
  const evidence = rule.evidence
    .map((entry) => `      ${entry.label}: ${formatValue(entry.value)}`)
    .join('\n');

  return [
    `  - ${rule.title}: ${rule.points}/${rule.maxPoints}`,
    `    ${rule.summary}`,
    evidence
  ].join('\n');
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null) {
    return 'unknown';
  }

  return String(value);
}
