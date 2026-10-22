# syntoralis-ecologits-cline-integration

Wrapper for [EcoLogits](https://github.com/mlco2/ecologits) for the Cline VS Code extension. Automatically measures and logs the carbon footprint of **every LLM API call** in CSV format.

## Recorded metrics

| CSV column | Description | Unit |
|------------|-------------|------|
| `timestamp` | ISO 8601 timestamp | — |
| `provider` | LLM provider used (anthropic, openai, cline…) | — |
| `model` | Model identifier | — |
| `input_tokens` | Input tokens (prompt) | tokens |
| `output_tokens` | Generated tokens (completion) | tokens |
| `energy_kwh` | Energy consumption | kWh |
| `gwp_kgco2eq` | Global Warming Potential | kg CO₂ eq |
| `adpe_kgsbeq` | Abiotic Depletion Potential for Elements | kg Sb eq |
| `wcf_l` | Water Consumption Footprint | L |

## Electricity mix configuration

By default, EcoLogits uses the global electricity mix (**WOR**). You can specify a different zone (e.g. `FRA`, `DE`, `US`) via the `cline.ecologits.electricityMixZone` setting. This affects the GWP/ADPe/PE impact factors per kWh used for the estimation.

## Quick installation

### Prerequisites
- [Node.js ≥ 18](https://nodejs.org)
- [Bun](https://bun.sh) (or npm for manual installation)

### Step 1 — Clone Cline and apply the patch

```bash
cd syntoralis-ecologits-cline-integration
node scripts/apply-patch.js
```

The script:
1. Clones `https://github.com/cline/cline.git` into `./cline-source` (or uses an existing folder)
2. Adds the `@ecologits/ecologits.js` dependency
3. Copies the TypeScript wrapper into Cline's source tree
4. Patches `sdk-api-handler.ts` to intercept LLM streams
5. Applies the Syntoralis logo and panel branding

### Step 2 — Compile the extension

```bash
cd cline-source/apps/vscode
bun install
bun run package
```

The compiled bundle is generated in `cline-source/apps/vscode/dist/extension.js`.

### Step 3 — Install in VS Code

1. Close all VS Code windows
2. Replace the existing extension folder:
   - **Windows**: `%USERPROFILE%\.vscode\extensions\saoudrizwan.claude-dev-*`
   - **macOS/Linux**: `~/.vscode/extensions/saoudrizwan.claude-dev-*`
3. Copy the contents of `cline-source/apps/vscode` into this folder
4. Restart VS Code

## Usage

As soon as Cline makes an LLM call, a line is added to the file:

```
%USERPROFILE%\syntoralis-ecologits-cline-log.csv   (Windows)
~/syntoralis-ecologits-cline-log.csv              (macOS/Linux)
```

You can change this path via the `ECOLOGITS_CSV_PATH` environment variable.

## Architecture

- **`src/ecologits-wrapper.ts`** — Generic wrapper around Cline's `ApiHandler`. Captures the `usage` stream chunk (input/output tokens) and latency, then calls `llmImpacts()` from the `@ecologits/ecologits.js` SDK.
- **`scripts/apply-patch.js`** — Automates injecting the wrapper into Cline's sources.
- **No Python dependency required**: uses the official TypeScript port of EcoLogits (`@ecologits/ecologits.js`) directly.

## Uninstallation / Restoration

To revert to the original Cline:

```bash
rm -rf cline-source
```

Then reinstall Cline from the VS Code Marketplace.
