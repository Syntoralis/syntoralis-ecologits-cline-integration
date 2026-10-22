import { SVGProps } from "react"
import type { Environment } from "../../../src/shared/config-types"
import { getEnvironmentColor } from "../utils/environmentColors"

const SyntoralisLogo = (props: SVGProps<SVGSVGElement> & { environment?: Environment }) => {
	const { environment, ...svgProps } = props
	const fillColor = environment ? getEnvironmentColor(environment) : "var(--vscode-icon-foreground)"

	return (
		<svg
			fill="none"
			height="50"
			role="img"
			viewBox="597 33 301 265"
			width="50"
			xmlns="http://www.w3.org/2000/svg"
			{...svgProps}>
			<title>Syntoralis</title>
			<path
				d="m683.12 177.942 21.964 21.981a17 17 0 0 1-24.038 24.038l-46.019-46.019H597.1c7.735 41.803 43.452 73.389 86.326 73.389 48.535 0 156.179-90.389 156.179-90.389S731.961 70.553 683.426 70.553c-42.874 0-78.591 31.586-86.326 73.389h129.982a17 17 0 0 1 0 34zm-124.015 0h-19.074a17 17 0 0 1 0-34h19.074C567.231 81.484 619.608 33 683.426 33c24.497 0 52.139 11.339 85.68 31.314q15.419 9.214 31.841 20.451a884 884 0 0 1 62.815 47.43L898 160.942l-34.238 28.747q-1.496 1.292-5.168 4.25-6.001 4.913-13.447 10.71c-14.144 11.05-29.07 22.1-44.2 32.47-10.914 7.48-21.573 14.348-31.841 20.468-33.541 19.958-61.183 31.297-85.68 31.297-63.818 0-116.195-48.484-124.321-110.942"
				fill={fillColor}
			/>
		</svg>
	)
}

export default SyntoralisLogo
