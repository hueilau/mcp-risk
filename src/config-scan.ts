import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename as pathBasename, join, resolve, relative } from 'node:path';

export type ScanSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ScanFormat = 'text' | 'json' | 'markdown';

export interface ConfigServer {
  filePath: string;
  name: string;
  location: string;
  command: string;
  args: string[];
  env: Record<string, unknown>;
  headers: Record<string, unknown>;
  url: string;
  transport: string;
  raw: Record<string, unknown>;
}

export interface ScanFinding {
  code: string;
  severity: ScanSeverity;
  title: string;
  detail: string;
}

export interface ScannedServer extends ConfigServer {
  findings: ScanFinding[];
  maxSeverity: ScanSeverity;
  score: number;
}

export interface ScanReport {
  generatedAt: string;
  files: string[];
  servers: ScannedServer[];
  summary: {
    serverCount: number;
    findingCount: number;
    maxSeverity: ScanSeverity;
    riskyServerCount: number;
  };
}

const defaultConfigCandidates = ['.mcp.json', 'mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', 'package.json'];
const severityScore: Record<ScanSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};
const execWrappers = new Set(['bash', 'sh', 'zsh', 'fish', 'cmd', 'cmd.exe', 'powershell', 'pwsh', 'python', 'python3', 'node', 'perl', 'ruby']);
const packageRunners = new Set(['npx', 'pnpx', 'bunx', 'yarn', 'uvx']);
const secretKeyPattern = /(token|secret|password|passwd|api[_-]?key|private[_-]?key|auth|credential)/i;
const placeholderPattern = /^(\$\{?[A-Z0-9_]+\}?|<[^>]+>|changeme|todo|example|your[-_])/i;
const pipeToShellPattern = /(curl|wget).*(\||;).*(bash|sh|zsh|pwsh|powershell)/i;

export function scanConfigFiles(inputFiles: string[] = [], cwd = process.cwd()): ScanReport {
  const files = inputFiles.length > 0 ? inputFiles.map(expandHome) : discoverConfigFiles(cwd);
  return scanConfigObjects(files.map((filePath) => readConfigFile(filePath)));
}

export function scanConfigObjects(configFiles: Array<{ path: string; json: unknown }>): ScanReport {
  const servers = configFiles.flatMap((configFile) => extractServers(configFile));
  const scannedServers = servers.map((server) => {
    const findings = analyzeServer(server);
    return {
      ...server,
      findings,
      maxSeverity: maxSeverity(findings),
      score: scoreFindings(findings)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    files: configFiles.map((configFile) => configFile.path),
    servers: scannedServers,
    summary: summarize(scannedServers)
  };
}

export function renderScanReport(report: ScanReport, format: ScanFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  if (format === 'markdown') {
    return renderMarkdown(report);
  }

  return renderText(report);
}

export function severityAtLeast(actual: ScanSeverity, minimum: ScanSeverity): boolean {
  return severityScore[actual] >= severityScore[minimum];
}

export function parseJsonLike(raw: string, filePath = 'config'): unknown {
  try {
    return JSON.parse(stripTrailingCommas(stripJsonComments(raw)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }
}

function discoverConfigFiles(cwd: string): string[] {
  return defaultConfigCandidates.map((candidate) => resolve(cwd, candidate)).filter((candidate) => existsSync(candidate));
}

function readConfigFile(filePath: string): { path: string; json: unknown } {
  const absolutePath = resolve(filePath);
  return {
    path: absolutePath,
    json: parseJsonLike(readFileSync(absolutePath, 'utf8'), absolutePath)
  };
}

function extractServers(configFile: { path: string; json: unknown }): ConfigServer[] {
  const groups: Array<{ label: string; location: string; value: unknown }> = [];
  collectServerGroups(configFile.json, [], groups);

  return groups
    .flatMap((group) => {
      if (Array.isArray(group.value)) {
        return group.value.map((server, index) =>
          normalizeServer({
            filePath: configFile.path,
            name: typeof getObjectValue(server, 'name') === 'string' ? String(getObjectValue(server, 'name')) : `${group.label}[${index}]`,
            location: group.location,
            value: server
          })
        );
      }

      if (isRecord(group.value)) {
        return Object.entries(group.value).map(([name, server]) =>
          normalizeServer({
            filePath: configFile.path,
            name,
            location: group.location,
            value: server
          })
        );
      }

      return [];
    })
    .filter((server): server is ConfigServer => Boolean(server));
}

function collectServerGroups(value: unknown, pathParts: string[], groups: Array<{ label: string; location: string; value: unknown }>): void {
  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (['mcpServers', 'servers'].includes(key) && (isRecord(child) || Array.isArray(child))) {
      groups.push({
        label: key,
        location: nextPath.join('.'),
        value: child
      });
      continue;
    }

    if (['mcp', 'modelContextProtocol'].includes(key)) {
      collectServerGroups(child, nextPath, groups);
    }
  }
}

function normalizeServer(input: { filePath: string; name: string; location: string; value: unknown }): ConfigServer | undefined {
  if (!isRecord(input.value)) {
    return undefined;
  }

  const command = getString(input.value, 'command');
  const argsValue = input.value.args;
  const args = Array.isArray(argsValue) ? argsValue.map(String) : [];
  const env = isRecord(input.value.env) ? input.value.env : {};
  const headers = isRecord(input.value.headers) ? input.value.headers : {};
  const url = getString(input.value, 'url') || getString(input.value, 'endpoint');
  const transport = getString(input.value, 'transport') || (url ? 'http' : command ? 'stdio' : 'unknown');

  return {
    filePath: input.filePath,
    name: input.name,
    location: input.location,
    command,
    args,
    env,
    headers,
    url,
    transport,
    raw: input.value
  };
}

function analyzeServer(server: ConfigServer): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const commandName = pathBasename(server.command).toLowerCase();
  const commandLine = [server.command, ...server.args].join(' ').trim();

  if (!server.command && !server.url) {
    findings.push(finding('MCP001', 'medium', 'Server has no command or URL', 'The scanner could not identify how this server starts. Review the raw config before trusting it.'));
  }

  if (execWrappers.has(commandName)) {
    findings.push(finding('MCP010', commandName === 'node' || commandName.startsWith('python') ? 'medium' : 'high', 'Server starts through a general-purpose interpreter or shell', "Shell and interpreter wrappers make it harder to review the exact code that will run with the MCP client's privileges."));
  }

  if (/\s-c\s|^-[ec]\b|\s\/c\s/i.test(` ${server.args.join(' ')} `)) {
    findings.push(finding('MCP011', 'high', 'Server uses inline command execution', 'Inline commands can hide downloads, file writes, or destructive actions inside a compact MCP config.'));
  }

  if (pipeToShellPattern.test(commandLine)) {
    findings.push(finding('MCP012', 'critical', 'Server appears to pipe remote code into a shell', 'Downloading code and executing it in one command gives the remote endpoint immediate local execution.'));
  }

  if (packageRunners.has(commandName)) {
    inspectPackageRunner(server, findings);
  }

  if (server.url) {
    inspectRemoteServer(server, findings);
  }

  inspectEnv(server, findings);
  inspectFilesystemScope(server, findings);
  inspectNetworkAndContainers(server, findings);

  return findings;
}

function inspectPackageRunner(server: ConfigServer, findings: ScanFinding[]): void {
  const commandName = pathBasename(server.command).toLowerCase();
  const packageName = firstPackageArg(commandName, server.args);

  if (!packageName) {
    findings.push(finding('MCP020', 'medium', 'Package runner has no obvious package name', 'Make sure this command resolves to a reviewed package instead of an implicit or local script.'));
    return;
  }

  if (/^(https?:|git\+|github:|git@)/i.test(packageName)) {
    findings.push(finding('MCP021', 'high', 'Package runner installs code directly from a URL or git reference', 'Prefer immutable package versions or commit SHAs that can be reviewed and reproduced.'));
    return;
  }

  if (packageName.endsWith('@latest')) {
    findings.push(finding('MCP022', 'high', 'Package uses the floating latest tag', 'A future package release can change what code runs inside the MCP client without a config change.'));
    return;
  }

  if (!hasPinnedVersion(packageName)) {
    findings.push(finding('MCP023', 'medium', 'Package version is not pinned', 'Pin MCP server packages to an exact version to make installs reproducible and reviewable.'));
  }
}

function inspectRemoteServer(server: ConfigServer, findings: ScanFinding[]): void {
  let parsed: URL;
  try {
    parsed = new URL(server.url);
  } catch {
    findings.push(finding('MCP030', 'medium', 'Remote server URL is not parseable', 'Malformed URLs are easy to misread and can point clients at unexpected endpoints.'));
    return;
  }

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  const hasAuthHeader = Object.keys(server.headers).some((key) => key.toLowerCase() === 'authorization');
  const hasAuthEnv = Object.keys(server.env).some((key) => secretKeyPattern.test(key));

  if (parsed.protocol === 'http:' && !isLocal) {
    findings.push(finding('MCP031', 'critical', 'Remote MCP server uses plain HTTP', 'Plain HTTP can expose tool traffic and credentials between the client and server.'));
  }

  if (!isLocal && !hasAuthHeader && !hasAuthEnv) {
    findings.push(finding('MCP032', 'high', 'Remote MCP server has no visible authorization', 'MCP HTTP transports should use authorization or another strong access-control mechanism.'));
  }
}

function inspectEnv(server: ConfigServer, findings: ScanFinding[]): void {
  for (const [key, value] of Object.entries(server.env)) {
    const stringValue = String(value ?? '');
    if (!secretKeyPattern.test(key)) {
      continue;
    }

    if (stringValue && !placeholderPattern.test(stringValue)) {
      findings.push(finding('MCP040', 'critical', `Environment variable ${key} appears to contain a literal secret`, 'Keep secrets in the host secret store or environment, not committed MCP config files.'));
    } else {
      findings.push(finding('MCP041', 'low', `Environment variable ${key} references a credential`, "Confirm this credential is scoped narrowly to the MCP server's actual needs."));
    }
  }
}

function inspectFilesystemScope(server: ConfigServer, findings: ScanFinding[]): void {
  const joinedArgs = server.args.join(' ');
  const broadPatterns = [
    /\s(--allow-dirs|--dir|--path|--root|--workspace)\s+(\/|~|\$HOME)(\s|$)/,
    /\s(-v|--volume)\s+(\/|~|\$HOME):/,
    /\s(\/|~|\$HOME)\s*$/
  ];

  if (broadPatterns.some((pattern) => pattern.test(` ${joinedArgs} `))) {
    findings.push(finding('MCP050', 'high', 'Server appears to receive broad filesystem access', 'Narrow MCP filesystem access to the smallest directory that the tool needs.'));
  }
}

function inspectNetworkAndContainers(server: ConfigServer, findings: ScanFinding[]): void {
  const commandLine = [server.command, ...server.args].join(' ');

  if (/(docker\.sock|\/var\/run\/docker\.sock)/.test(commandLine)) {
    findings.push(finding('MCP060', 'critical', 'Server can access the Docker socket', 'Docker socket access is close to host-level control on many developer machines.'));
  }

  if (/\b(--privileged|--cap-add|--net=host|--network=host)\b/.test(commandLine)) {
    findings.push(finding('MCP061', 'high', 'Server starts with elevated container privileges', 'Privileged container flags expand the blast radius of a compromised MCP server.'));
  }
}

function renderText(report: ScanReport): string {
  const lines = ['MCP Risk scan', `Servers: ${report.summary.serverCount}  Findings: ${report.summary.findingCount}  Max severity: ${report.summary.maxSeverity}`, ''];

  if (report.summary.serverCount === 0) {
    lines.push('No MCP servers found in the scanned config files.');
    return `${lines.join('\n')}\n`;
  }

  for (const server of report.servers) {
    lines.push(`${server.name} (${server.maxSeverity}, score ${server.score})`);
    lines.push(`  ${relative(process.cwd(), server.filePath)}#${server.location}`);
    if (server.command) lines.push(`  command: ${[server.command, ...server.args].join(' ')}`);
    if (server.url) lines.push(`  url: ${server.url}`);
    if (server.findings.length === 0) {
      lines.push('  ok: no findings');
    } else {
      for (const item of server.findings) {
        lines.push(`  [${item.severity}] ${item.code}: ${item.title}`);
        lines.push(`    ${item.detail}`);
      }
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderMarkdown(report: ScanReport): string {
  const lines = ['# MCP Risk Scan', '', `- Servers: ${report.summary.serverCount}`, `- Findings: ${report.summary.findingCount}`, `- Max severity: ${report.summary.maxSeverity}`, ''];

  for (const server of report.servers) {
    lines.push(`## ${server.name}`, '', `- Severity: ${server.maxSeverity}`, `- Score: ${server.score}`, `- Location: \`${relative(process.cwd(), server.filePath)}#${server.location}\``);
    if (server.command) lines.push(`- Command: \`${[server.command, ...server.args].join(' ')}\``);
    if (server.url) lines.push(`- URL: \`${server.url}\``);
    lines.push('');
    if (server.findings.length === 0) {
      lines.push('No findings.', '');
    } else {
      lines.push('| Severity | Code | Finding |', '|---|---|---|');
      for (const item of server.findings) {
        lines.push(`| ${item.severity} | ${item.code} | ${item.title.replaceAll('|', '\\|')} |`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function summarize(servers: ScannedServer[]): ScanReport['summary'] {
  const findingCount = servers.reduce((total, server) => total + server.findings.length, 0);
  const max = servers.reduce((highest, server) => (severityScore[server.maxSeverity] > severityScore[highest] ? server.maxSeverity : highest), 'info' as ScanSeverity);

  return {
    serverCount: servers.length,
    findingCount,
    maxSeverity: max,
    riskyServerCount: servers.filter((server) => severityAtLeast(server.maxSeverity, 'medium')).length
  };
}

function maxSeverity(findings: ScanFinding[]): ScanSeverity {
  return findings.reduce((max, current) => (severityScore[current.severity] > severityScore[max] ? current.severity : max), 'info' as ScanSeverity);
}

function scoreFindings(findings: ScanFinding[]): number {
  return Math.min(100, findings.reduce((total, current) => total + severityScore[current.severity] * 12, 0));
}

function finding(code: string, severity: ScanSeverity, title: string, detail: string): ScanFinding {
  return { code, severity, title, detail };
}

function firstPackageArg(commandName: string, args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === '--package' || arg === '-p') && args[index + 1]) return args[index + 1];
    if (arg.startsWith('-')) continue;
    if (commandName === 'yarn' && arg === 'dlx') continue;
    return arg;
  }

  return '';
}

function hasPinnedVersion(packageName: string): boolean {
  const cleaned = packageName.replace(/^npm:/, '');
  return /^[^@]+@\d/.test(cleaned) || /^@[^/]+\/[^@]+@\d/.test(cleaned);
}

function stripJsonComments(raw: string): string {
  let output = '';
  let inString = false;
  let stringQuote = '';
  let escaping = false;

  for (let i = 0; i < raw.length; i += 1) {
    const current = raw[i];
    const next = raw[i + 1];

    if (inString) {
      output += current;
      if (escaping) escaping = false;
      else if (current === '\\') escaping = true;
      else if (current === stringQuote) {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringQuote = current;
      output += current;
      continue;
    }

    if (current === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      output += '\n';
      continue;
    }

    if (current === '/' && next === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        output += raw[i] === '\n' ? '\n' : '';
        i += 1;
      }
      i += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function stripTrailingCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, '$1');
}

function expandHome(candidate: string): string {
  if (!candidate.startsWith('~')) {
    return candidate;
  }

  return join(homedir(), candidate.slice(1));
}

function getString(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === 'string' ? value[key] : '';
}

function getObjectValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
