import * as fs from "fs"
import * as os from "os"
import * as path from "path"
// @ts-ignore — resolved at install time in the Cline workspace
import { ImpactsOutput, llmImpacts } from "@ecologits/ecologits.js"

/**
 * EcoLogits logger configuration.
 */
export interface EcoLogitsConfig {
  /** Output CSV file path (default: ~/syntoralis-ecologits-cline-log.csv) */
  csvPath?: string
  /** Enable/disable logging */
  enabled?: boolean
  /** EcoLogits electricity mix zone (default: WOR/world). Ex: FRA, DE, US… */
  electricityMixZone?: string
}

const DEFAULT_CSV_PATH = path.join(os.homedir(), "syntoralis-ecologits-cline-log.csv")

/** Mapping Cline providers → EcoLogits providers */
const PROVIDER_MAP: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  "openai-compatible": "openai",
  google: "google_genai",
  google_genai: "google_genai",
  mistral: "mistralai",
  mistralai: "mistralai",
  cohere: "cohere",
  huggingface_hub: "huggingface_hub",
  huggingface: "huggingface_hub",
}

function valueToNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    const r = value as { min: number; max: number }
    return (r.min + r.max) / 2
  }
  return 0
}

function initializeCsv(csvPath: string): void {
  if (!fs.existsSync(csvPath)) {
    const header =
      "timestamp,provider,model,input_tokens,output_tokens,energy_kwh,gwp_kgco2eq,adpe_kgsbeq,wcf_l\n"
    fs.writeFileSync(csvPath, header, { encoding: "utf-8" })
  }
}

function getEcoLogitsProvider(providerId: string): string {
  return PROVIDER_MAP[providerId] || "openai"
}

/**
 * Computes and writes the environmental impacts of an LLM call in CSV.
 *
 * @param providerId   provider identifier (ex: "anthropic", "openai", "cline")
 * @param modelId      model identifier (ex: "claude-sonnet-4-20250514")
 * @param inputTokens  tokens en entrée
 * @param outputTokens tokens générés
 * @param latencySec   latence de la requête en secondes
 * @param config       configuration optionnelle
 */
export async function logLlmImpacts(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  latencySec: number,
  config?: EcoLogitsConfig,
): Promise<void> {
  if (config?.enabled === false) return

  const csvPath = config?.csvPath || process.env.ECOLOGITS_CSV_PATH || DEFAULT_CSV_PATH

  try {
    initializeCsv(csvPath)

    const ecoProvider = getEcoLogitsProvider(providerId)
    const impacts: ImpactsOutput = llmImpacts({
      provider: ecoProvider,
      modelName: modelId,
      outputTokenCount: outputTokens,
      requestLatency: latencySec,
      ...(config?.electricityMixZone ? { electricity_mix_zone: config.electricityMixZone } : {}),
    })

    if (impacts.hasErrors) {
      console.warn(
        `[EcoLogits] Impacts unavailable for ${providerId}/${modelId}: ${impacts.errors
          ?.map((e) => (e instanceof Error ? e.message : String(e)))
          .join(", ")}`,
      )
      return
    }

    const energyKwh = valueToNumber(impacts.energy?.value)
    const gwpKg = valueToNumber(impacts.gwp?.value)
    const adpeKg = valueToNumber(impacts.adpe?.value)
    const wcfLiters = valueToNumber(impacts.wcf?.value)

    const row = `${new Date().toISOString()},${providerId},${modelId},${inputTokens},${outputTokens},${energyKwh},${gwpKg},${adpeKg},${wcfLiters}\n`

    fs.appendFileSync(csvPath, row, { encoding: "utf-8" })
    console.log(`[EcoLogits] Metrics written → ${csvPath}`)
  } catch (err) {
    console.warn(`[EcoLogits] Logging failed: ${err}`)
  }
}

/** Minimal type for a Cline stream chunk */
export interface ApiStreamChunk {
  type: string
  inputTokens?: number
  outputTokens?: number
  [key: string]: unknown
}

/** Minimal type for the Cline handler */
export interface ClineApiHandlerLike {
  getModel(): { id: string; providerId?: string }
  createMessage(
    systemPrompt: string,
    messages: unknown[],
    tools?: unknown[],
  ): AsyncGenerator<ApiStreamChunk> & { id?: string }
}

/**
 * Wraps a Cline `ApiHandler` to intercept LLM calls and log
 * environmental impacts automatically via EcoLogits.
 *
 * @param handler  raw Cline handler
 * @param config   EcoLogits configuration
 * @returns        wrapped handler (same interface)
 */
export function wrapApiHandler<T extends ClineApiHandlerLike>(
  handler: T,
  config?: EcoLogitsConfig,
): T {
  const originalCreateMessage = handler.createMessage.bind(handler)

  handler.createMessage = function (
    systemPrompt: string,
    messages: unknown[],
    tools?: unknown[],
  ) {
    const startTime = Date.now()
    const generator = originalCreateMessage(systemPrompt, messages, tools)
    const modelInfo = handler.getModel()

    async function* wrappedGenerator(): AsyncGenerator<ApiStreamChunk> {
      let inputTokens = 0
      let outputTokens = 0

      for await (const chunk of generator) {
        if (chunk.type === "usage") {
          inputTokens = chunk.inputTokens ?? inputTokens
          outputTokens = chunk.outputTokens ?? outputTokens
        }
        yield chunk as ApiStreamChunk
      }

      const latency = (Date.now() - startTime) / 1000
      // Fire-and-forget — ne bloque pas le stream
      logLlmImpacts(
        modelInfo.providerId ?? "unknown",
        modelInfo.id,
        inputTokens,
        outputTokens,
        latency,
        config,
      ).catch(() => {})
    }

    const stream = wrappedGenerator() as AsyncGenerator<ApiStreamChunk> & { id?: string }
    if ((generator as any).id) {
      stream.id = (generator as any).id
    }
    return stream
  }

  return handler
}



