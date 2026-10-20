import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgGlobe(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path strokeLinecap="round" strokeLinejoin="round" d="M12.5 19v3m-2 0h4" />
				<Circle cx={7} cy={7} r={7} strokeLinecap="round" transform="matrix(-1 0 0 1 20.5 2)" />
				<Path
					strokeLinejoin="round"
					d="M8.5 4c.654.038.992.359 1.573.973 1.05 1.11 2.1 1.202 2.8.832 1.049-.555.167-1.453 1.399-1.94.803-.32.915-1.185.468-1.865M20 10c-1.5 0-1.766 1.247-3 1-2.5-.5-3.208.059-3.208 1.251s0 1.192-.52 2.086c-.338.582-.457 1.163.217 1.663"
				/>
				<Path
					strokeLinecap="round"
					d="M6.5 2a9.85 9.85 0 0 0-3 7.083C3.5 14.56 7.977 19 13.5 19a10 10 0 0 0 7-2.835"
				/>
			</G>
		</Svg>
	);
}
