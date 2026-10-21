import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSunset(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path strokeLinejoin="round" d="M8 22h8M5 19h14M2 16h20" />
				<Path d="M12 6a6 6 0 0 1 4.5 9.969h-9A6 6 0 0 1 12 6Z" />
				<Path strokeLinejoin="round" d="M12 6v7m-2-2 2 2 2-2" />
				<Path d="M12 2v1M22 12h-1M3 12H2M19.07 4.93l-.392.393M5.322 5.322l-.393-.393" />
			</G>
		</Svg>
	);
}
