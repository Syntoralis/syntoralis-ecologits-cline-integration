# syntoralis-ecologits-cline-integration

Integration of [EcoLogits](https://github.com/mlco2/ecologits) with the Cline VS Code extension. It estimates environmental impacts from model usage metrics and writes them to a CSV file when usage data is available.

## CSV fields

| CSV column | Description | Unit |
|------------|-------------|------|
| `timestamp` | ISO 8601 timestamp | — |
| `provider` | Normalized LLM provider identifier | — |
| `model` | Model used for the EcoLogits estimate | — |
| `input_tokens` | Input tokens (prompt) | tokens |
| `output_tokens` | Generated tokens (completion) | tokens |
| `energy_kwh` | Energy consumption | kWh |
| `gwp_kgco2eq` | Global Warming Potential | kg CO₂ eq |
| `adpe_kgsbeq` | Abiotic Depletion Potential for Elements | kg Sb eq |
| `wcf_l` | Water Consumption Footprint | L |
| `unknown_model` | Original model name when an EcoLogits proxy model is used; empty otherwise | — |

Estimates depend on the model, token usage, and configured electricity mix. Requests that do not provide usage metrics cannot be estimated. Some SDK session flows can be instrumented through both the API handler and session hooks, so duplicate CSV rows may occur.

## Configuration

These settings are available in VS Code under `cline.ecologits`:

| Setting | Default | Description |
|---------|---------|-------------|
| `cline.ecologits.enabled` | `true` | Enable or disable impact logging |
| `cline.ecologits.csvPath` | unset | CSV output path; takes precedence over `ECOLOGITS_CSV_PATH` |
| `cline.ecologits.proxyModel` | `gpt-5.6-luna` | Model used to estimate impacts when EcoLogits does not recognize the requested model |
| `cline.ecologits.electricityMixZone` | unset | Electricity mix zone, such as `FRA`, `DE`, or `US` |

When `electricityMixZone` is unset, EcoLogits uses the global electricity mix (`WOR`). This affects the impact factors used for the estimate. The original model name is recorded in `unknown_model` when a proxy model is used.

## Quick installation

### Prerequisites
- [Node.js ≥ 18](https://nodejs.org)
- [Bun](https://bun.sh)

### Step 1 — Clone Cline and apply the patch

```bash
npm run patch-cline
```

This clones `https://github.com/cline/cline.git` into `./cline-source` if it does not already exist, adds the EcoLogits dependency and integration, and applies Syntoralis branding. The patch script can also be run directly with an optional Cline source directory:

```bash
node scripts/apply-patch.js <cline-source-directory>
```

### Step 2 — Compile the extension

```bash
cd cline-source/apps/vscode
bun install
bun run package
```

The command runs type checks and linting, builds the production bundle, and creates `cline-syntoralis-<version>.vsix` in `cline-source/apps/vscode`.

### Step 3 — Install in VS Code

Install the generated VSIX:

```bash
code --install-extension cline-syntoralis-<version>.vsix
```

## Usage

When Cline completes an instrumented model operation with usage metrics, the impact estimate is appended to a CSV file. The default location is:

```
%USERPROFILE%\syntoralis-ecologits-cline-log.csv   (Windows)
~/syntoralis-ecologits-cline-log.csv              (macOS/Linux)
```

Set `cline.ecologits.csvPath` in VS Code to choose a path. If it is unset, the `ECOLOGITS_CSV_PATH` environment variable is used; otherwise, the default location above is used.

## Architecture

- **`src/ecologits-wrapper.ts`** — Wraps Cline's API handler, reads usage metrics from model responses, and calls `llmImpacts()` from `@ecologits/ecologits.js`.
- **`scripts/apply-patch.js`** — Adds the dependency and integration to a Cline source checkout and applies Syntoralis branding.
- **No Python dependency required** — the integration uses EcoLogits' TypeScript package directly.

## Uninstallation / Restoration

To remove the generated Cline checkout, first make sure it contains no work you need, then delete the `cline-source` directory using your file manager. Reinstall Cline from the VS Code Marketplace to return to the original extension.
