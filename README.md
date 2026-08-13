# Phylax for Visual Studio Code

[![VS Code Marketplace](https://img.shields.io/badge/VS_Code-Marketplace-0098FF)](https://marketplace.visualstudio.com/items?itemName=phylax.phylax)

View package trust, attestations and policy feedback without leaving your editor.

The extension reads your manifests and marks any dependency whose Phylax verdict is not `ALLOW`, so a risky package shows up in the Problems panel alongside your type errors rather than at the end of a CI run.

## Install

Search `Phylax` in the Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=phylax.phylax).

## Usage

The extension activates when a workspace contains `package.json`, `package-lock.json`, `requirements.txt` or `pyproject.toml`.

<details open>
<summary><b>Sign in</b></summary>

If you have already run `phylax auth login` in a terminal there is nothing to do. The extension reuses that session, so there is one login rather than two.

Otherwise run **Phylax: Sign in** from the Command Palette, or set `PHYLAX_API_TOKEN` in your environment.

</details>

<details>
<summary><b>What you see</b></summary>

Open a manifest and every dependency is verified in a single batched request. Verdicts appear as inline diagnostics, hovering a dependency shows provenance, risk score and findings, and the status bar reports how many dependencies are blocked.

</details>

### Commands

| Command | Description |
| --- | --- |
| `Phylax: Sign in` | Store an API token. |
| `Phylax: Scan workspace dependencies` | Verify every open manifest now. |
| `Phylax: Clear diagnostics` | Clear results and the cache. |

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| `phylax.enable` | `true` | Enable verification. |
| `phylax.scanOnOpen` | `true` | Verify when a manifest is opened. |
| `phylax.policyLevel` | `moderate` | Which verdicts reach the Problems panel. |
| `phylax.showInlineResults` | `true` | Show verdicts inline and on hover. |
| `phylax.autoUpdate` | `true` | Re-verify when a manifest is saved. |
| `phylax.policy` | none | Named policy. Empty uses the organization default. |
| `phylax.baseUrl` | `https://api.phyi.dev` | |

`policyLevel` controls what is reported, not what is checked. `lenient` surfaces only `BLOCK`, `moderate` adds `WARN`, `strict` reports every dependency including those that pass.

Commit `.vscode/settings.json` to share one configuration with the team. The token stays in each developer's environment, which is the point of not putting it there.

## A note on ranges

A manifest records a range, and a range is not what installs. The extension resolves what it can from the manifest, so if a verdict here disagrees with one from CI, check that your lockfile is committed and current. CI verifies the lockfile, which is the stricter and more accurate signal.

## Development

<details>
<summary>Contributor commands</summary>

```sh
npm install
npm run typecheck
npm test
npm run build
```

</details>

## License

MIT

## The rest of Phylax

| Tool | Where to get it |
| --- | --- |
| JavaScript SDK | [`@phyi/sdk`](https://www.npmjs.com/package/@phyi/sdk) on npm |
| Python SDK | [`phylax-sdk`](https://github.com/praxi-labs/phylax-sdk-python), PyPI release pending |
| MCP server | [`@phyi/mcp`](https://www.npmjs.com/package/@phyi/mcp) on npm |
| Agent runtime gate | [`@phyi/runtime-gate`](https://www.npmjs.com/package/@phyi/runtime-gate) on npm |
| VS Code extension | [`phylax.phylax`](https://marketplace.visualstudio.com/items?itemName=phylax.phylax) on the Marketplace |
| GitHub Action | [`praxi-labs/phylax-action`](https://github.com/praxi-labs/phylax-action) |
| Browser extension | [`praxi-labs/phylax-chrome`](https://github.com/praxi-labs/phylax-chrome/releases/latest), Web Store listing pending |

Docs live at [phyi.dev](https://phyi.dev).
