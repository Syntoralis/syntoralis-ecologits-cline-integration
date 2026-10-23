import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PLATFORM_CONFIG } from "@/config/platform.config"
import { PlatformType } from "@/config/platform.config"

interface EcologitsStatsRow {
  period: string
  model: string
  inputTokens: number
  outputTokens: number
  energyKwh: number
  gwpKg: number
  adpeKg: number
  wcfLiters: number
  count: number
}

interface EcologitsStatsData {
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

interface EcologitsStatsProps {
  onClose: () => void
}

const formatNumber = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

const formatInteger = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

const EcologitsStats = ({ onClose }: EcologitsStatsProps) => {
  const [stats, setStats] = useState<EcologitsStatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<"month" | "year">("month")
  const [modelFilter, setModelFilter] = useState<string>("")

  const requestStats = useCallback(() => {
    setLoading(true)
    setError(null)
    PLATFORM_CONFIG.postMessage({
      type: "open_ecologits_stats",
      groupBy,
    })
  }, [groupBy])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data
      if (message && message.type === "ecologits_stats") {
        setStats(message.stats)
        setLoading(false)
      } else if (message && message.type === "ecologits_stats_error") {
        setError(message.error ?? "Failed to load statistics")
        setLoading(false)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  useEffect(() => {
    requestStats()
  }, [requestStats])

  const filteredRows = useMemo(() => {
    if (!stats) return []
    return stats.rows.filter((row) => {
      if (modelFilter && row.model !== modelFilter) return false
      return true
    })
  }, [stats, modelFilter])

  const displayModels = useMemo(() => {
    if (!stats) return []
    return ["All models", ...stats.models]
  }, [stats])

  const displayTotals = useMemo(() => {
    if (!stats) return null
    if (modelFilter) {
      const filtered = stats.rows.filter((row) => row.model === modelFilter)
      return filtered.reduce(
        (acc, row) => ({
          inputTokens: acc.inputTokens + row.inputTokens,
          outputTokens: acc.outputTokens + row.outputTokens,
          energyKwh: acc.energyKwh + row.energyKwh,
          gwpKg: acc.gwpKg + row.gwpKg,
          adpeKg: acc.adpeKg + row.adpeKg,
          wcfLiters: acc.wcfLiters + row.wcfLiters,
          count: acc.count + row.count,
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          energyKwh: 0,
          gwpKg: 0,
          adpeKg: 0,
          wcfLiters: 0,
          count: 0,
        },
      )
    }
    return stats.totals
  }, [stats, modelFilter])

  if (PLATFORM_CONFIG.type !== PlatformType.VSCODE) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-background w-full max-w-4xl max-h-[90vh] rounded-md border border-editor-widget-border shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-editor-widget-border/50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">EcoLogits Statistics</h2>
          <Button onClick={onClose} size="sm" variant="secondary" className="hover:bg-accent">Close</Button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Group by:</span>
                <div className="flex items-center gap-1 border border-input bg-input rounded-md p-1">
                  <Button onClick={() => setGroupBy("month")} size="sm" variant={groupBy === "month" ? "default" : "outline"} className="rounded-sm">Month</Button>
                  <Button onClick={() => setGroupBy("year")} size="sm" variant={groupBy === "year" ? "default" : "outline"} className="rounded-sm">Year</Button>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-sm text-muted-foreground">Model:</span>
                <Select onValueChange={(value) => setModelFilter(value === "All models" ? "" : value)} value={modelFilter || "All models"}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {displayModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={requestStats} size="sm" disabled={loading}>Refresh</Button>
              </div>
            </div>

            {loading && <div className="text-muted-foreground text-sm">Loading statistics...</div>}

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
            )}

            {stats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Total requests</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatInteger(displayTotals?.count || 0)}</div>
                  </div>
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Input tokens</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatInteger(displayTotals?.inputTokens || 0)}</div>
                  </div>
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Output tokens</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatInteger(displayTotals?.outputTokens || 0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Energy (kWh)</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatNumber(displayTotals?.energyKwh || 0)}</div>
                  </div>
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">GWP (kg CO₂eq)</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatNumber(displayTotals?.gwpKg || 0)}</div>
                  </div>
                  <div className="p-4 rounded-md border border-editor-widget-border/50 bg-editor-widget-border/10">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Water (L)</div>
                    <div className="text-xl font-mono font-semibold text-foreground">{formatNumber(displayTotals?.wcfLiters || 0)}</div>
                  </div>
                </div>

                <div className="rounded-md border border-editor-widget-border/50 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-panel bg-muted/50">
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Period</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Model</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Requests</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Input tokens</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Output tokens</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Energy (kWh)</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">GWP (kg CO₂eq)</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">ADPe (kg Sbeq)</th>
                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Water (L)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-panel">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                            No statistics found in {stats.csvPath}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={`${row.period}-${row.model}`} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{row.period}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{row.model}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatInteger(row.count)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatInteger(row.inputTokens)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatInteger(row.outputTokens)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatNumber(row.energyKwh)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatNumber(row.gwpKg)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatNumber(row.adpeKg)}</td>
                            <td className="px-4 py-3 text-sm text-right text-foreground">{formatNumber(row.wcfLiters)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {stats.periods.length > 0 && (
                  <div className="mt-4 p-3 rounded-md border border-editor-widget-border/50 bg-muted/30 text-xs text-muted-foreground">
                    Periods: {stats.periods.join(", ")}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EcologitsStats