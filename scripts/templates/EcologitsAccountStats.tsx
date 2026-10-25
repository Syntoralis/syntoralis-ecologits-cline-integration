import { Button } from "@/components/ui/button"
import { PlatformType, PLATFORM_CONFIG } from "@/config/platform.config"
import { useState } from "react"
import EcologitsStats from "@/components/stats/EcologitsStats"

const EcologitsAccountStats = () => {
	const [showStats, setShowStats] = useState(false)

	if (PLATFORM_CONFIG.type !== PlatformType.VSCODE) {
		return null
	}

	return (
		<div className="mb-4">
			<Button onClick={() => setShowStats(true)} size="sm" variant="secondary">
				View EcoLogits Statistics
			</Button>
			{showStats && <EcologitsStats onClose={() => setShowStats(false)} />}
		</div>
	)
}

export default EcologitsAccountStats
