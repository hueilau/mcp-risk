#!/usr/bin/env node
import { cac } from 'cac';
import { checkTarget } from './check.js';
import { renderScanReport, scanConfigFiles, severityAtLeast, type ScanFormat, type ScanSeverity } from './config-scan.js';
import { renderHumanReport, renderJsonReport, renderQuietReport } from './reporters.js';

const cli = cac('mcp-risk');

cli
  .command('check <target>', 'Score an npm package or GitHub repo before installing an MCP server')
  .option('--json', 'Print a stable JSON report')
  .option('--quiet', 'Print only score, grade, and verdict')
  .option('--fail-under <score>', 'Exit non-zero when the score is below this threshold')
  .action(async (target: string, options: { json?: boolean; quiet?: boolean; failUnder?: string }) => {
    try {
      const report = await checkTarget(target);
      const failUnder = parseFailUnder(options.failUnder);

      if (options.json) {
        process.stdout.write(renderJsonReport(report));
      } else if (options.quiet) {
        process.stdout.write(`${renderQuietReport(report)}\n`);
      } else {
        process.stdout.write(`${renderHumanReport(report)}\n`);
      }

      if (report.score < failUnder) {
        process.exitCode = 2;
      }
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  });

cli
  .command('scan [...files]', 'Scan MCP config files for risky server settings')
  .option('--format <format>', 'Print as text, json, or markdown', { default: 'text' })
  .option('--json', 'Shortcut for --format json')
  .option('--fail-on <severity>', 'Exit non-zero when max severity is at least this level')
  .action((files: string[] | undefined, options: { format?: string; json?: boolean; failOn?: string }) => {
    try {
      const format = parseFormat(options.json ? 'json' : options.format);
      const failOn = parseSeverity(options.failOn);
      const report = scanConfigFiles(files ?? []);

      process.stdout.write(renderScanReport(report, format));

      if (failOn && severityAtLeast(report.summary.maxSeverity, failOn)) {
        process.exitCode = 2;
      }
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  });

cli.help();
cli.version('0.1.0');
cli.parse();

function parseFailUnder(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--fail-under must be a number from 0 to 100.');
  }

  return parsed;
}

function parseFormat(value: string | undefined): ScanFormat {
  if (value === undefined) {
    return 'text';
  }

  if (value === 'text' || value === 'json' || value === 'markdown') {
    return value;
  }

  throw new Error('--format must be text, json, or markdown.');
}

function parseSeverity(value: string | undefined): ScanSeverity | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }

  throw new Error('--fail-on must be low, medium, high, or critical.');
}
