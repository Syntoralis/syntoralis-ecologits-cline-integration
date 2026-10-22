import { Button } from "@/components/ui/button"
import { PlatformType, PLATFORM_CONFIG } from "@/config/platform.config"

const settings = [
	{
		name: "EcoLogits tracking",
		description: "Enable or disable environmental impact estimates and CSV logging for LLM requests.",
	},
	{
		name: "CSV log path",
		description: "Choose where impact estimates are stored. Leave empty to use the default local log file.",
	},
	{
		name: "Proxy model",
		description: "Choose the model used to estimate impacts when the requested model is not available.",
	},
	{
		name: "Electricity mix zone",
		description: "Set the electricity mix used by estimates, for example FRA. Leave empty to use the global mix.",
	},
]

const SyntoralisFeatureSettings = () => {
	if (PLATFORM_CONFIG.type !== PlatformType.VSCODE) {
		return null
	}

	return (
		<div>
			<div className="text-xs font-medium text-foreground/80 uppercase tracking-wider mb-3">Syntoralis</div>
			<div className="relative p-3 my-3 rounded-md border border-editor-widget-border/50">
				<div className="space-y-3">
					<div>
						<h4 className="text-sm font-medium text-foreground">EcoLogits</h4>
						<p className="text-xs text-muted-foreground">
							Configure estimates of energy use and environmental impacts for LLM requests.
						</p>
					</div>
					<dl className="space-y-2">
						{settings.map(({ name, description }) => (
							<div key={name}>
								<dt className="text-sm font-medium text-foreground">{name}</dt>
								<dd className="text-xs text-muted-foreground">{description}</dd>
							</div>
						))}
					</dl>
					<Button
						onClick={() => PLATFORM_CONFIG.postMessage({ type: "open_ecologits_settings" })}
						size="sm"
						variant="secondary">
						Open EcoLogits settings in VS Code
					</Button>
				</div>
			</div>
		</div>
	)
}

export default SyntoralisFeatureSettings
