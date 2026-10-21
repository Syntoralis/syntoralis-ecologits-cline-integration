# ecologits-cline-integration

Wrapper [EcoLogits](https://github.com/mlco2/ecologits) pour l'extension Cline (VS Code).  
Mesure et logue automatiquement l'empreinte carbone de **chaque appel API LLM** au format CSV.

## Métriques enregistrées

| Colonne CSV | Description | Unité |
|-------------|-------------|-------|
| `timestamp` | Horodatage ISO 8601 | — |
| `provider` | Fournisseur LLM utilisé (anthropic, openai, cline…) | — |
| `model` | Identifiant du modèle | — |
| `input_tokens` | Tokens en entrée (prompt) | tokens |
| `output_tokens` | Tokens générés (completion) | tokens |
| `energy_kwh` | Consommation énergétique | kWh |
| `gwp_kgco2eq` | Potential de Réchauffement Global | kg CO₂ eq |
| `adpe_kgsbeq` | Potentiel d'Épuisement des Ressources Minérales | kg Sb eq |
| `wcf_m3` | Empreinte Eau | m³ |

## Installation rapide

### Prérequis
- [Node.js ≥ 18](https://nodejs.org)
- [Bun](https://bun.sh) (ou npm pour une installation manuelle)

### Étape 1 — Cloner Cline et appliquer le patch

```bash
cd ecologits-cline-integration
node scripts/apply-patch.js
```

Le script :
1. Clone `https://github.com/cline/cline.git` dans `./cline-source` (ou utilise un dossier existant)
2. Ajoute la dépendance `@ecologits/ecologits.js`
3. Copie le wrapper TypeScript dans l'arbre source de Cline
4. Patche `sdk-api-handler.ts` pour intercepter les streams LLM

### Étape 2 — Compiler l'extension

```bash
cd cline-source/apps/vscode
bun install
bun run package
```

Le bundle compilé est généré dans `cline-source/apps/vscode/dist/extension.js`.

### Étape 3 — Installer dans VS Code

1. Ferme toutes les fenêtres VS Code
2. Remplace le dossier de l'extension existante :
   - **Windows** : `%USERPROFILE%\.vscode\extensions\saoudrizwan.claude-dev-*`
   - **macOS/Linux** : `~/.vscode/extensions/saoudrizwan.claude-dev-*`
3. Copie le contenu de `cline-source/apps/vscode` dans ce dossier
4. Relance VS Code

## Utilisation

Dès que Cline émet un appel LLM, une ligne est ajoutée au fichier :

```
%USERPROFILE%\ecologits-cline-log.csv   (Windows)
~/ecologits-cline-log.csv              (macOS/Linux)
```

Vous pouvez modifier ce chemin via la variable d'environnement `ECOLOGITS_CSV_PATH`.

## Architecture

- **`src/ecologits-wrapper.ts`** — Wrapper générique autour du `ApiHandler` Cline. Capture le chunk `usage` du stream (input/output tokens) et la latence, puis appelle `llmImpacts()` du SDK `@ecologits/ecologits.js`.
- **`scripts/apply-patch.js`** — Automatise l'injection du wrapper dans les sources de Cline.
- **Aucune dépendance Python requise** : utilise directement le port TypeScript officiel d'EcoLogits (`@ecologits/ecologits.js`).

## Désinstallation / Restauration

Pour revenir à Cline d'origine :
```bash
rm -rf cline-source
```
Puis réinstallez Cline depuis le marketplace VS Code.
# cline-syntoralis
