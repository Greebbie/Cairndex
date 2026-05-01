---
id: PROP-002
proposalType: update
targetType: spec
status: rejected
summary: Phase 9 dogfood update
reason: manual sanity test
contentHash: a63f1a4a19ddd60ca96999b7a3a0b4e65567b180ebe636fece9f713085bef1cb
created: '2026-05-01T19:08:07.688Z'
provenance:
  created_by: manual-dogfood
  session: phase9-dogfood
target: SPEC-001
rejectedAt: '2026-05-01T19:08:20.747Z'
rejectionReason: phase 9 dogfood — sanity test only
---
{
  "name": "cairndex",
  "version": "0.0.0",
  "description": "Lightweight Markdown-native project memory for AI-assisted coding",
  "type": "module",
  "bin": {
    "cairndex": "./bin/cairndex"
  },
  "files": ["bin", "dist", "templates"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "prepublish": "node scripts/copy-web.mjs"
  },
  "dependencies": {
    "@cairndex/core": "workspace:*",
    "@cairndex/server": "workspace:^",
    "@modelcontextprotocol/sdk": "^1.27.0",
    "commander": "^12.1.0",
    "js-yaml": "^4.1.1",
    "kleur": "^4.1.5",
    "open": "^10.1.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "prompts": "^2.4.2"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.0.0",
    "@types/prompts": "^2.4.9"
  },
  "engines": {
    "node": ">=20"
  }
}
