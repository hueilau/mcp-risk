# Contributing

Thanks for helping make MCP adoption safer and easier to review.

## Local setup

```bash
npm test
npm run check
node src/cli.js scan examples/risky.mcp.json
```

## Pull request guidelines

- Keep rules explainable. A finding should tell users what to change.
- Add a test fixture for each new rule.
- Prefer low false positives over dramatic scoring.
- Keep runtime dependencies at zero unless the benefit is very clear.

## Rule design

Each rule should include:

- A stable code such as `MCP070`.
- A severity from `low`, `medium`, `high`, or `critical`.
- A short title.
- A concrete remediation detail.
