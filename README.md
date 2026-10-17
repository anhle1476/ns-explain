# ns-explain

Explain a code change in plain language, then export one HTML file with an
interactive diagram. This repository is both the user-level skill and the
`ns-explain` package.

## Install the skill

```bash
synca skills install https://github.com/ngosangns/ns-explain
```

That copies the skill to `~/.agents/skills/ns-explain` and links it into each
agent. Node 22.18 or newer runs the TypeScript directly. `bun` is required
when rendering an export.

## Package

The repository root is the package. From a checkout:

```bash
node scripts/ns-explain.ts playbook
node scripts/ns-explain.ts render .ns-explain/<name>.json
node scripts/ns-explain.ts serve .ns-explain/<name>.html
```
