# MCP Risk

Pre-install and config risk checks for MCP servers and agent tools.

`mcp-risk` gives developers two quick review loops:

- `mcp-risk check <target>` scores an npm package or GitHub repo before you install an MCP server.
- `mcp-risk scan [config files...]` scans MCP config files for risky server settings.

The goal is not to prove that a server is safe. The goal is to make the first review obvious: recent maintenance, adoption signals, package hygiene, pinned installs, visible authorization, literal secrets, filesystem scope, and privileged container access.

Works today from GitHub. npm publishing can come later.

## Why This Exists

MCP is useful because it lets agents use real tools. That also means MCP server configuration deserves a quick review before it runs on a developer machine or inside CI.

The MCP specification notes that local servers can pose security risks when they run with the client user's privileges, and that HTTP transports should use authorization or another strong access-control mechanism. `mcp-risk` turns those practical concerns into simple checks.

## Quick Start

Run directly from the public GitHub repo:

```bash
npm exec --yes --package github:hueilau/mcp-risk -- mcp-risk check chrome-devtools-mcp
npm exec --yes --package github:hueilau/mcp-risk -- mcp-risk scan .cursor/mcp.json
```

Expected `check` shape:

```text
97 A Low visible metadata risk.
```

Or clone and run locally:

```bash
git clone https://github.com/hueilau/mcp-risk.git
cd mcp-risk
npm ci
npm run build
node dist/cli.js check chrome-devtools-mcp --quiet
node dist/cli.js scan examples/risky.mcp.json
```

After the package is published to npm, these shorter commands will work:

```bash
npx mcp-risk check chrome-devtools-mcp
npx mcp-risk scan .cursor/mcp.json
```

You can also install globally from npm after publication:

```bash
npm install -g mcp-risk
mcp-risk check @playwright/mcp
mcp-risk scan
```

## Check A Package Or Repo

```bash
mcp-risk check chrome-devtools-mcp
mcp-risk check @playwright/mcp --quiet
mcp-risk check ChromeDevTools/chrome-devtools-mcp --json
mcp-risk check fake-package --fail-under 80
```

`check` looks at visible public metadata from npm and GitHub:

- Maintenance recency
- Downloads, stars, forks, and dependents
- License, repo links, issue links, keywords, and maintainers
- Obvious risk flags such as archived repos or missing license metadata

`check` is metadata-only. It does not install or execute the target package.

## Scan MCP Config

```bash
mcp-risk scan examples/risky.mcp.json
mcp-risk scan --format json examples/risky.mcp.json
mcp-risk scan --format markdown examples/risky.mcp.json > mcp-risk-report.md
mcp-risk scan --fail-on high examples/risky.mcp.json
```

When no config path is provided, `mcp-risk scan` looks for common project-local files:

- `.mcp.json`
- `mcp.json`
- `.cursor/mcp.json`
- `.vscode/mcp.json`
- `package.json`

Scan a Claude Desktop config on macOS:

```bash
mcp-risk scan ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Expected `scan` shape:

```text
MCP Risk scan
Servers: 2  Findings: 5  Max severity: critical
```

## Scan Checks

| Code | Severity | What it catches |
|---|---:|---|
| `MCP010` | medium/high | Shell or interpreter wrappers such as `bash`, `sh`, `python`, or `node` |
| `MCP011` | high | Inline command execution such as `bash -c` |
| `MCP012` | critical | Remote download piped into a shell |
| `MCP021` | high | Package runner installing directly from URL or git |
| `MCP022` | high | Floating `@latest` package installs |
| `MCP023` | medium | Package runner without a pinned exact version |
| `MCP031` | critical | Remote MCP URL using plain HTTP |
| `MCP032` | high | Remote MCP URL with no visible authorization |
| `MCP040` | critical | Literal secrets in config env vars |
| `MCP050` | high | Broad filesystem access such as `/`, `~`, or `$HOME` |
| `MCP060` | critical | Docker socket access |
| `MCP061` | high | Elevated container flags |

## CI

Use the GitHub package before npm publication:

```yaml
- name: Scan MCP config
  run: npm exec --yes --package github:hueilau/mcp-risk -- mcp-risk scan --fail-on high
```

After npm publication, the command can be shortened to `npx mcp-risk scan --fail-on high`.

Exit codes:

- `0`: command completed and no configured threshold failed.
- `1`: command could not run, parse input, or fetch required metadata.
- `2`: `check --fail-under` or `scan --fail-on` failed.

That means this command is expected to exit `2` for the intentionally risky fixture:

```bash
node dist/cli.js scan examples/risky.mcp.json --fail-on high
```

## Development

```bash
npm ci
npm run check
npm run build
node dist/cli.js check chrome-devtools-mcp --quiet
node dist/cli.js scan examples/risky.mcp.json
npm pack --dry-run
```

The package tarball includes only the compiled CLI, examples, README, license, and package metadata.

## Limitations

- Scores are review aids, not security guarantees.
- `check` depends on public npm and GitHub metadata, which can be incomplete.
- `scan` is conservative and rule-based; open a false-positive issue when a rule is too noisy.

## Contributing

Good first contributions:

- Add fixtures for MCP configs from popular clients.
- Improve detection for one risky pattern without adding noisy false positives.
- Add scoring signals for package or repo metadata.
- Add output adapters for security tools.

Keep rules explainable. A finding should tell users what to review or change.
