# Contributing

Thanks for helping make MCP adoption safer and easier to review.

## Local setup

```bash
npm ci
npm run check
npm run build
node dist/cli.js check chrome-devtools-mcp --quiet
node dist/cli.js scan examples/risky.mcp.json
npm pack --dry-run
```

For faster CLI iteration:

```bash
npm run dev -- scan examples/risky.mcp.json
npm run dev -- check chrome-devtools-mcp --quiet
```

## Project shape

- `src/config-scan.ts` contains MCP config parsing, rules, and scan reporting.
- `src/scoring.ts` contains package/repo metadata scoring.
- `src/providers/` contains npm and GitHub metadata fetchers.
- `test/fixtures/` contains stable API fixtures so tests do not depend on live network calls.

## Before opening a PR

```bash
npm run check
npm run build
npm pack --dry-run
```

The intentionally risky fixture should exit `2` when a high threshold is enforced:

```bash
node dist/cli.js scan examples/risky.mcp.json --fail-on high
```

## Pull request guidelines

- Keep rules explainable. A finding should tell users what to change or review.
- Add or update a test fixture for each new rule or scoring signal.
- Prefer low false positives over dramatic scoring.
- Keep runtime dependencies small and justified.
- Update the README when user-visible commands, output, or rules change.

## Rule design

Each scan rule should include:

- A stable code such as `MCP070`.
- A severity from `low`, `medium`, `high`, or `critical`.
- A short title.
- A concrete remediation detail.

Each metadata scoring signal should include:

- A stable rule id such as `maintenance.recency`.
- Evidence fields that explain why the score changed.
- Tests for healthy and risky examples.
