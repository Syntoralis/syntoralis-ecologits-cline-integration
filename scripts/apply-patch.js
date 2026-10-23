#!/usr/bin/env node
/**
 * Script de patch automatique pour Cline.
 *
 * Usage: node scripts/apply-patch.js [chemin_vers_cline_source]
 * Si aucun chemin n'est fourni, clone dans ./cline-source
 */
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

function ensureClineSource(targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.log(`[PATCH] Clonage de Cline dans ${targetDir} …`)
    execSync(
      `git clone --depth 1 https://github.com/cline/cline.git "${targetDir}"`,
      { stdio: "inherit" },
    )
  } else {
    console.log(`[PATCH] Utilisation de Cline existant: ${targetDir}`)
  }
}

function injectDependency(clinePkgPath) {
  const pkg = JSON.parse(fs.readFileSync(clinePkgPath, "utf-8"))
  if (!pkg.dependencies["@ecologits/ecologits.js"]) {
    pkg.dependencies["@ecologits/ecologits.js"] = "^3.0.0"
    fs.writeFileSync(clinePkgPath, JSON.stringify(pkg, null, "\t") + "\n", "utf-8")
    console.log("[PATCH] Dépendance @ecologits/ecologits.js ajoutée")
  }
}

function copyWrapper(targetDir) {
  const srcFile = path.join(__dirname, "..", "src", "ecologits-wrapper.ts")
  const destDir = path.join(targetDir, "apps", "vscode", "src", "services")
  const destFile = path.join(destDir, "ecologits-wrapper.ts")
  if (!fs.existsSync(destDir)) {
    throw new Error(`Dossier destination introuvable: ${destDir}`)
  }
  fs.copyFileSync(srcFile, destFile)
  console.log("[PATCH] ecologits-wrapper.ts copié dans Cline")
}

function patchSdkApiHandler(targetDir) {
  const handlerPath = path.join(
    targetDir, "apps", "vscode", "src", "sdk", "sdk-api-handler.ts",
  )
  let content = fs.readFileSync(handlerPath, "utf-8")
  if (content.includes("ecologits-wrapper")) {
    console.log("[PATCH] sdk-api-handler.ts déjà modifié, skip")
    return
  }

  const firstImportIdx = content.indexOf("import ")
  content =
    content.slice(0, firstImportIdx) +
    'import { wrapApiHandler, type ApiStreamChunk } from "@/services/ecologits-wrapper"\n' +
    'import { Logger } from "@shared/services/Logger"\n\n' +
    content.slice(firstImportIdx)

  const returnHandlerIdx = content.indexOf("\treturn handler\n}", content.indexOf("handler.getModel = () =>"))
  if (returnHandlerIdx === -1) {
    throw new Error("Impossible de localiser '\\treturn handler\\n}'")
  }

  const wrapperBlock = `\t/* ===== EcoLogits wrapper ===== */\n\tconst originalCreateMessage = handler.createMessage.bind(handler)\n\thandler.createMessage = function (\n\t\tsystemPrompt: string,\n\t\tmessages: import("@cline/shared").Message[],\n\t\ttools?: import("@cline/shared").ToolDefinition[],\n): ApiStream {\n\t\tconst startTime = Date.now()\n\t\tconst generator = originalCreateMessage(systemPrompt, messages, tools)\n\t\tconst modelInfo = handler.getModel()\n\n\t\tasync function* wrappedGenerator(): AsyncGenerator<ApiStreamChunk> {\n\t\t\tlet inputTokens = 0\n\t\t\tlet outputTokens = 0\n\n\t\t\tfor await (const chunk of generator) {\n\t\t\t\tif (chunk.type === "usage") {\n\t\t\t\t\tinputTokens = chunk.inputTokens\n\t\t\t\t\toutputTokens = chunk.outputTokens\n\t\t\t\t}\n\t\t\t\tyield chunk as ApiStreamChunk\n\t\t\t}\n\n\t\t\tconst requestLatency = (Date.now() - startTime) / 1000\n\t\t\tconst { logLlmImpacts } = await import("@/services/ecologits-wrapper")\n\t\t\tlogLlmImpacts(\n\t\t\t\tmodelInfo.providerId ?? providerConfig.providerId,\n\t\t\t\tmodelInfo.id,\n\t\t\t\tinputTokens,\n\t\t\t\toutputTokens,\n\t\t\t\trequestLatency,\n\t\t\t).catch(() => {})\n\t\t}\n\n\t\tconst stream = wrappedGenerator() as ApiStream\n\t\tif ((generator as any).id) {\n\t\t\tstream.id = (generator as any).id\n\t\t}\n\t\treturn stream\n\t}\n\t/* ===== /EcoLogits wrapper ===== */\n\n`

  const loggedWrapperBlock = wrapperBlock.replace(
    "\t\t\t\trequestLatency,\n\t\t\t).catch(() => {})",
    "\t\t\t\trequestLatency,\n\t\t\t\t{ logger: Logger },\n\t\t\t).catch(() => {})",
  )
  content = content.slice(0, returnHandlerIdx) + loggedWrapperBlock + content.slice(returnHandlerIdx)
  fs.writeFileSync(handlerPath, content, "utf-8")
  console.log("[PATCH] sdk-api-handler.ts modifié")
}

function patchPanelTitle(clinePkgPath) {
  const pkg = JSON.parse(fs.readFileSync(clinePkgPath, "utf-8"))
  const activityBar = pkg.contributes?.viewsContainers?.activitybar
  if (activityBar) {
    for (const view of activityBar) {
      if (view.id === "claude-dev-ActivityBar" && view.title === "Cline") {
        view.title = "Cline-Syntoralis"
        console.log("[PATCH] Titre du panneau renommé: Cline → Cline-Syntoralis")
      }
    }
  }
  if (pkg.contributes?.configuration?.title === "Cline") {
    pkg.contributes.configuration.title = "Cline-Syntoralis"
    console.log("[PATCH] Titre de configuration renommé: Cline → Cline-Syntoralis")
  }
  const packageCommand = "bun run check-types && bun run lint && bun run build:production && vsce package --no-dependencies"
  if (pkg.scripts?.package !== packageCommand) {
    pkg.scripts ??= {}
    pkg.scripts.package = packageCommand
    console.log("[PATCH] Action package configurée pour générer le VSIX")
  }
  fs.writeFileSync(clinePkgPath, JSON.stringify(pkg, null, "\t") + "\n", "utf-8")
}

function copySyntoralisLogo(targetDir) {
  const srcFile = path.join(__dirname, "templates", "SyntoralisLogo.tsx")
  const destDir = path.join(targetDir, "apps", "vscode", "webview-ui", "src", "assets")
  const destFile = path.join(destDir, "SyntoralisLogo.tsx")
  if (!fs.existsSync(destDir)) {
    throw new Error(`Dossier destination introuvable: ${destDir}`)
  }
  if (!fs.existsSync(srcFile)) {
    throw new Error(`Fichier source introuvable: ${srcFile}`)
  }
  fs.copyFileSync(srcFile, destFile)
  console.log("[PATCH] SyntoralisLogo.tsx copié dans Cline")
}

function patchHomeHeader(targetDir) {
  const headerPath = path.join(
    targetDir, "apps", "vscode", "webview-ui", "src", "components", "welcome", "HomeHeader.tsx",
  )
  let content = fs.readFileSync(headerPath, "utf-8")
  if (content.includes("SyntoralisLogo")) {
    const updatedContent = content.replace(
      '<SyntoralisLogo className="size-20"',
      '<SyntoralisLogo className="size-16"',
    )
    if (updatedContent !== content) {
      fs.writeFileSync(headerPath, updatedContent, "utf-8")
      console.log("[PATCH] Taille du logo Syntoralis ajustée")
    }
    console.log("[PATCH] HomeHeader.tsx déjà modifié, skip")
    return
  }

  content = content.replace(
    'import ClineLogoVariable from "@/assets/ClineLogoVariable"',
    'import ClineLogoVariable from "@/assets/ClineLogoVariable"\nimport SyntoralisLogo from "@/assets/SyntoralisLogo"'
  )

  content = content.replace(
    "const LogoComponent = isDecember ? ClineLogoSanta : ClineLogoVariable",
    "const ClineLogoComponent = isDecember ? ClineLogoSanta : ClineLogoVariable"
  )

  content = content.replace(
    `<div className="my-7">\n\t\t\t\t<LogoComponent className="size-20" environment={environment} />\n\t\t\t</div>`,
    `<div className="my-7 flex items-center justify-center gap-3">\n\t\t\t\t<SyntoralisLogo className="size-16" environment={environment} />\n\t\t\t\t<ClineLogoComponent className="size-20" environment={environment} />\n\t\t\t</div>`
  )

  fs.writeFileSync(headerPath, content, "utf-8")
  console.log("[PATCH] HomeHeader.tsx modifié avec logos Syntoralis + Cline")
}

function patchAboutSection(targetDir) {
  const aboutPath = path.join(
    targetDir,
    "apps",
    "vscode",
    "webview-ui",
    "src",
    "components",
    "settings",
    "sections",
    "AboutSection.tsx",
  )
  let content = fs.readFileSync(aboutPath, "utf-8")

  if (content.includes("Cline-Syntoralis is an AI coding assistant")) {
    console.log("[PATCH] AboutSection.tsx déjà modifié, skip")
    return
  }

  const originalDescription =
    /<p>\s*An AI assistant that can use your CLI and Editor\.[\s\S]*?<\/p>/
  if (!originalDescription.test(content)) {
    throw new Error("Impossible de localiser la description d'origine dans AboutSection.tsx")
  }
  if (!content.includes("Cline v{version}")) {
    throw new Error("Impossible de localiser le titre d'origine dans AboutSection.tsx")
  }

  content = content.replace("Cline v{version}", "Cline-Syntoralis v{version}")
  content = content.replace(
    originalDescription,
    `<p>
\t\t\t\t\t\tCline-Syntoralis is an AI coding assistant that works in your editor and command line. It can explore projects,
\t\t\t\t\t\tedit files, use the browser, and run terminal commands after you approve them.
\t\t\t\t\t</p>
\t\t\t\t\t<p>
\t\t\t\t\t\tThis edition uses{" "}
\t\t\t\t\t\t<VSCodeLink href="https://ecologits.ai/latest/">EcoLogits</VSCodeLink> to estimate the energy use and
\t\t\t\t\t\tenvironmental impacts of LLM requests, including greenhouse-gas emissions, resource depletion, and water
\t\t\t\t\t\tconsumption. Estimates are recorded in a local CSV file.
\t\t\t\t\t</p>`,
  )
  content = content.replace(
    /\n(?=\t{5}<h3 className="text-md font-semibold">Development<\/h3>)/,
    `
\t\t\t\t\t<h3 className="text-md font-semibold">About Syntoralis</h3>
\t\t\t\t\t<p>
\t\t\t\t\t\tSyntoralis develops responsible digital solutions. Learn more on the{" "}
\t\t\t\t\t\t<VSCodeLink href="https://www.syntoralis.eu/index-en.html">Syntoralis website</VSCodeLink> or view the{" "}
\t\t\t\t\t\t<VSCodeLink href="https://github.com/Syntoralis/cline-syntoralis">Cline-Syntoralis source code</VSCodeLink>.
\t\t\t\t\t</p>
\t\t\t\t\t`,
  )

  fs.writeFileSync(aboutPath, content, "utf-8")
  console.log("[PATCH] AboutSection.tsx modifié avec les descriptions et liens")
}

function patchSyntoralisFeatureSettings(targetDir) {
  const webviewDir = path.join(targetDir, "apps", "vscode", "webview-ui", "src")
  const templatePath = path.join(__dirname, "templates", "SyntoralisFeatureSettings.tsx")
  const sectionPath = path.join(
    webviewDir,
    "components",
    "settings",
    "sections",
    "FeatureSettingsSection.tsx",
  )
  const sectionComponentPath = path.join(
    webviewDir,
    "components",
    "settings",
    "sections",
    "SyntoralisFeatureSettings.tsx",
  )
  const webviewMessagePath = path.join(targetDir, "apps", "vscode", "src", "shared", "WebviewMessage.ts")
  const webviewProviderPath = path.join(
    targetDir,
    "apps",
    "vscode",
    "src",
    "hosts",
    "vscode",
    "VscodeWebviewProvider.ts",
  )

  if (!fs.existsSync(sectionComponentPath)) {
    fs.copyFileSync(templatePath, sectionComponentPath)
    console.log("[PATCH] SyntoralisFeatureSettings.tsx copié dans Cline")
  }

  let sectionContent = fs.readFileSync(sectionPath, "utf-8")
  if (!sectionContent.includes("SyntoralisFeatureSettings")) {
    const importAnchor = 'import Section from "../Section"\n'
    const advancedAnchor = "\n\t\t\t\t{/* Advanced */}"
    if (!sectionContent.includes(importAnchor) || !sectionContent.includes(advancedAnchor)) {
      throw new Error("Impossible de localiser les points d'insertion dans FeatureSettingsSection.tsx")
    }
    sectionContent = sectionContent.replace(
      importAnchor,
      `${importAnchor}import SyntoralisFeatureSettings from "./SyntoralisFeatureSettings"\n`,
    )
    sectionContent = sectionContent.replace(
      advancedAnchor,
      "\n\t\t\t\t<SyntoralisFeatureSettings />\n" + advancedAnchor,
    )
    fs.writeFileSync(sectionPath, sectionContent, "utf-8")
    console.log("[PATCH] Syntoralis settings ajoutés à Feature Settings")
  } else {
    console.log("[PATCH] Feature Settings Syntoralis déjà modifié, skip")
  }

  let webviewMessage = fs.readFileSync(webviewMessagePath, "utf-8")
  if (!webviewMessage.includes('"open_ecologits_settings"')) {
    const messageType = 'type: "grpc_request" | "grpc_request_cancel"'
    if (!webviewMessage.includes(messageType)) {
      throw new Error("Impossible de localiser le type de message WebviewMessage")
    }
    webviewMessage = webviewMessage.replace(
      messageType,
      'type: "grpc_request" | "grpc_request_cancel" | "open_ecologits_settings"',
    )
    fs.writeFileSync(webviewMessagePath, webviewMessage, "utf-8")
    console.log("[PATCH] Message d'ouverture des réglages EcoLogits ajouté")
  }

  let webviewProvider = fs.readFileSync(webviewProviderPath, "utf-8")
  webviewProvider = webviewProvider.replace(
    '"@id:cline.ecologits"',
    '"@ext:syntoralis.cline-syntoralis"',
  )
  if (!webviewProvider.includes('case "open_ecologits_settings"')) {
    const defaultCase = '\t\t\tdefault: {\n\t\t\t\tLogger.error("Received unhandled WebviewMessage type:", JSON.stringify(message))'
    if (!webviewProvider.includes(defaultCase)) {
      throw new Error("Impossible de localiser le dispatch WebviewMessage")
    }
    webviewProvider = webviewProvider.replace(
      defaultCase,
      '\t\t\tcase "open_ecologits_settings": {\n' +
        '\t\t\t\tawait vscode.commands.executeCommand("workbench.action.openSettings", "@ext:syntoralis.cline-syntoralis")\n' +
        "\t\t\t\tbreak\n" +
        "\t\t\t}\n" +
        defaultCase,
    )
    console.log("[PATCH] Action hôte d'ouverture des réglages EcoLogits ajoutée")
  }
  fs.writeFileSync(webviewProviderPath, webviewProvider, "utf-8")
}

function main() {
  const targetDir = process.argv[2] || path.join(process.cwd(), "cline-source")
  console.log("========================================")
  console.log("  EcoLogits ↔ Cline  ::  Patch Tool")
  console.log("========================================\n")
  ensureClineSource(targetDir)
  const clinePkgPath = path.join(targetDir, "apps", "vscode", "package.json")
  if (!fs.existsSync(clinePkgPath)) {
    throw new Error("structure Cline invalide (package.json manquant)")
  }
  injectDependency(clinePkgPath)
  copyWrapper(targetDir)
  patchSdkApiHandler(targetDir)
  patchPanelTitle(clinePkgPath)
  copySyntoralisLogo(targetDir)
  patchHomeHeader(targetDir)
  patchAboutSection(targetDir)
  patchSyntoralisFeatureSettings(targetDir)
  console.log("\n========================================")
  console.log("  PATCH APPLIQUÉ AVEC SUCCÈS")
  console.log("========================================")
  console.log(`\nProchaines étapes:\n  cd "${path.join(targetDir, "apps", "vscode")}"`)
  console.log("  bun install")
  console.log("  bun run package")
  console.log("\nPuis installe l'extension manuellement dans VS Code.")
}

main()
