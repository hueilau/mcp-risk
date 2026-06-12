import { describe, expect, it } from 'vitest';
import { parseJsonLike, scanConfigObjects } from '../src/config-scan.js';

describe('scanConfigFiles', () => {
  it('flags common risky MCP config patterns', () => {
    const json = parseJsonLike(`{
      "mcpServers": {
        "filesystem": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem@latest", "/"],
          "env": {"GITHUB_TOKEN": "ghp_literal"}
        },
        "remote": {
          "url": "http://mcp.example.com/mcp"
        }
      }
    }`);

    const report = scanObject(json);
    const codes = report.servers.flatMap((server) => server.findings.map((finding) => finding.code));

    expect(report.summary.serverCount).toBe(2);
    expect(report.summary.maxSeverity).toBe('critical');
    expect(codes).toContain('MCP022');
    expect(codes).toContain('MCP031');
    expect(codes).toContain('MCP040');
    expect(codes).toContain('MCP050');
  });

  it('accepts pinned package runner configs', () => {
    const report = scanObject({
      mcpServers: {
        docs: {
          command: 'npx',
          args: ['-y', '@example/mcp-docs@1.2.3'],
          env: {
            DOCS_TOKEN: '${DOCS_TOKEN}'
          }
        }
      }
    });

    expect(report.servers[0].maxSeverity).toBe('low');
    expect(report.servers[0].findings.map((finding) => finding.code)).toEqual(['MCP041']);
  });
});

function scanObject(json: unknown) {
  return scanConfigObjects([{ path: '/tmp/mcp.json', json }]);
}
