import * as fs from "fs"
import * as os from "os"
import * as path from "path"
// @ts-ignore — resolved at install time in the Cline workspace
import { ImpactsOutput, llmImpacts, models } from "@ecologits/ecologits.js"

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
  /** Model used to estimate impacts when the requested model is unknown to EcoLogits. */
  proxyModel?: string
  logger?: {
    warn(message: string): void
  }
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
      "timestamp,provider,model,input_tokens,output_tokens,energy_kwh,gwp_kgco2eq,adpe_kgsbeq,wcf_l,unknown_model\n"
    fs.writeFileSync(csvPath, header, { encoding: "utf-8" })
    return
  }

  const content = fs.readFileSync(csvPath, "utf-8")
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n"
  const [header, ...rows] = content.split(/\r?\n/)
  if (header && !header.endsWith(",unknown_model")) {
    fs.writeFileSync(
      csvPath,
      [`${header},unknown_model`, ...rows.map((row) => (row ? `${row},` : row))].join(lineEnding),
      { encoding: "utf-8" },
    )
  }
}

function getEcoLogitsProvider(providerId: string): string {
  return PROVIDER_MAP[providerId] || "openai"
}

async function warn(config: EcoLogitsConfig | undefined, message: string): Promise<void> {
  if (config?.logger) {
    config.logger.warn(message)
    return
  }

  try {
    // @ts-ignore - module only exists in the patched Cline workspace
    const { Logger } = await import("@/shared/services/Logger")
    Logger.warn(message)
  } catch {
    process.emitWarning(message, { type: "EcoLogits" })
  }
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
    const registeredModel = models.findModel(ecoProvider, modelId)
    const unknownModel = registeredModel ? "" : modelId
    const impactModel = registeredModel
      ? modelId
      : config?.proxyModel?.trim() || "gpt-5.6-luna"
    const impacts: ImpactsOutput = llmImpacts({
      provider: ecoProvider,
      modelName: impactModel,
      outputTokenCount: outputTokens,
      requestLatency: latencySec,
      ...(config?.electricityMixZone ? { electricity_mix_zone: config.electricityMixZone } : {}),
    })

    if (impacts.hasErrors) {
      await warn(
        config,
        `[EcoLogits] Impacts unavailable for ${providerId}/${modelId}: ${impacts.errors
          ?.map((e) => (e instanceof Error ? e.message : String(e)))
          .join(", ")}`,
      )
      const row = `${new Date().toISOString()},${providerId},${impactModel},${inputTokens},${outputTokens},,,,,\n`
      fs.appendFileSync(csvPath, row, { encoding: "utf-8" })
      return
    }

    const energyKwh = valueToNumber(impacts.energy?.value)
    const gwpKg = valueToNumber(impacts.gwp?.value)
    const adpeKg = valueToNumber(impacts.adpe?.value)
    const wcfLiters = valueToNumber(impacts.wcf?.value)
    const row = `${new Date().toISOString()},${providerId},${impactModel},${inputTokens},${outputTokens},${energyKwh},${gwpKg},${adpeKg},${wcfLiters},${unknownModel}\n`
    fs.appendFileSync(csvPath, row, { encoding: "utf-8" })
  } catch (err) {
    await warn(config, `[EcoLogits] Logging failed: ${err}`)
    const row = `${new Date().toISOString()},${providerId},${modelId},${inputTokens},${outputTokens},,,,,\n`
    fs.appendFileSync(csvPath, row, { encoding: "utf-8" })
  }
}

/**
 * Statistics row aggregated by period (month or year) and model.
 */
export interface EcologitsStatsRow {
  period: string // "YYYY-MM" or "YYYY"
  model: string
  inputTokens: number
  outputTokens: number
  energyKwh: number
  gwpKg: number
  adpeKg: number
  wcfLiters: number
  count: number
}

/** Aggregated statistics returned to the webview UI. */
export interface EcologitsStatsData {
  rows: EcologitsStatsRow[]
  totals: {
    inputTokens: number
    outputTokens: number
    energyKwh: number
    gwpKg: number
    adpeKg: number
    wcfLiters: number
    count: number
  }
  models: string[]
  periods: string[]
  csvPath: string
}

type ParsedCsvRow = {
  timestamp: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  energyKwh: number
  gwpKg: number
  adpeKg: number
  wcfLiters: number
}

type CsvColumnIndexes = Record<keyof ParsedCsvRow, number>

const DEFAULT_CSV_COLUMNS: CsvColumnIndexes = {
  timestamp: 0,
  provider: 1,
  model: 2,
  inputTokens: 3,
  outputTokens: 4,
  energyKwh: 5,
  gwpKg: 6,
  adpeKg: 7,
  wcfLiters: 8,
}

function parseCsvColumns(line: string): string[] {
  const columns: string[] = []
  let column = ""
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const character = line[i]
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        column += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      columns.push(column)
      column = ""
    } else {
      column += character
    }
  }
  columns.push(column)
  return columns
}

function getCsvColumnIndexes(header: string[]): CsvColumnIndexes | null {
  const normalizedHeader = header.map((column) => column.trim().toLowerCase().replace(/^\uFEFF/, ""))
  const aliases: Record<keyof ParsedCsvRow, string[]> = {
    timestamp: ["timestamp", "date", "datetime"],
    provider: ["provider", "provider_id"],
    model: ["model", "model_id", "model_name"],
    inputTokens: ["input_tokens", "input tokens", "prompt_tokens"],
    outputTokens: ["output_tokens", "output tokens", "completion_tokens"],
    energyKwh: ["energy_kwh", "energy (kwh)", "energy"],
    gwpKg: ["gwp_kgco2eq", "gwp_kg_co2eq", "gwp_kg", "gwp"],
    adpeKg: ["adpe_kgsbeq", "adpe_kg_sbeq", "adpe_kg", "adpe"],
    wcfLiters: ["wcf_l", "wcf_liters", "water_liters", "water"],
  }
  const indexes = {} as CsvColumnIndexes

  for (const [key, names] of Object.entries(aliases) as [keyof ParsedCsvRow, string[]][]) {
    const index = normalizedHeader.findIndex((column) => names.includes(column))
    if (index < 0) return null
    indexes[key] = index
  }
  return indexes
}

function parseCsvRow(line: string, columns: CsvColumnIndexes): ParsedCsvRow | null {
  const values = parseCsvColumns(line)
  if (values.length <= Math.max(...Object.values(columns))) return null
  const timestamp = values[columns.timestamp].trim()
  const model = values[columns.model].trim()
  if (!model || Number.isNaN(new Date(timestamp).getTime())) return null
  const metric = (index: number) => {
    const value = Number.parseFloat(values[index].trim())
    return Number.isFinite(value) ? value : 0
  }

  return {
    timestamp,
    provider: values[columns.provider],
    model,
    inputTokens: metric(columns.inputTokens),
    outputTokens: metric(columns.outputTokens),
    energyKwh: metric(columns.energyKwh),
    gwpKg: metric(columns.gwpKg),
    adpeKg: metric(columns.adpeKg),
    wcfLiters: metric(columns.wcfLiters),
  }
}

function getPeriodKey(timestamp: string, groupBy: "month" | "year"): string {
  const date = new Date(timestamp)
  if (groupBy === "year") {
    return date.getFullYear().toString()
  }
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${date.getFullYear()}-${month}`
}

/**
 * Reads the EcoLogits CSV log file and computes cumulative statistics
 * grouped by period (month or year), optionally filtered by model.
 *
 * @param csvPath    Path to the CSV log file
 * @param groupBy    "month" or "year"
 * @param modelFilter Optional model id to filter by (undefined = all models)
 * @returns Aggregated statistics data
 */
export function getEcologitsStats(
  csvPath: string,
  groupBy: "month" | "year" = "month",
  modelFilter?: string,
): EcologitsStatsData {
  const rows: EcologitsStatsRow[] = []
  const modelSet = new Set<string>()
  const periodSet = new Set<string>()
  let totals = {
    inputTokens: 0,
    outputTokens: 0,
    energyKwh: 0,
    gwpKg: 0,
    adpeKg: 0,
    wcfLiters: 0,
    count: 0,
  }

  if (!require("fs").existsSync(csvPath)) {
    return { rows: [], totals, models: [], periods: [], csvPath }
  }

  const content = require("fs").readFileSync(csvPath, "utf-8")
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/)
  const firstLine = lines[0] ?? ""
  const headerIndexes = getCsvColumnIndexes(parseCsvColumns(firstLine))
  const columns = headerIndexes ?? DEFAULT_CSV_COLUMNS
  const startIndex = headerIndexes ? 1 : 0
  const aggregatedRows = new Map<string, EcologitsStatsRow>()

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const row = parseCsvRow(line, columns)
    if (!row) continue
    if (modelFilter && row.model !== modelFilter) continue

    const period = getPeriodKey(row.timestamp, groupBy)
    periodSet.add(period)
    modelSet.add(row.model)

    totals.inputTokens += row.inputTokens
    totals.outputTokens += row.outputTokens
    totals.energyKwh += row.energyKwh
    totals.gwpKg += row.gwpKg
    totals.adpeKg += row.adpeKg
    totals.wcfLiters += row.wcfLiters
    totals.count += 1

    const key = `${period}\0${row.model}`
    const existing = aggregatedRows.get(key)
    if (existing) {
      existing.inputTokens += row.inputTokens
      existing.outputTokens += row.outputTokens
      existing.energyKwh += row.energyKwh
      existing.gwpKg += row.gwpKg
      existing.adpeKg += row.adpeKg
      existing.wcfLiters += row.wcfLiters
      existing.count += 1
    } else {
      const aggregate = {
        period,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        energyKwh: row.energyKwh,
        gwpKg: row.gwpKg,
        adpeKg: row.adpeKg,
        wcfLiters: row.wcfLiters,
        count: 1,
      }
      aggregatedRows.set(key, aggregate)
      rows.push(aggregate)
    }
  }

  // Sort rows by period (descending) then model
  rows.sort((a, b) => {
    if (a.period !== b.period) return b.period.localeCompare(a.period)
    return a.model.localeCompare(b.model)
  })

  return {
    rows,
    totals,
    models: Array.from(modelSet).sort(),
    periods: Array.from(periodSet).sort().reverse(),
    csvPath,
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
