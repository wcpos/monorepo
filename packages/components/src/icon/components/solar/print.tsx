import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPrint(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M9 10H6M19 14H5M17.983 6c-.047-1.553-.22-2.48-.862-3.121C16.243 2 14.828 2 12 2s-4.243 0-5.121.879C6.237 3.52 6.064 4.447 6.017 6M18 14v2c0 2.828 0 4.243-.879 5.121C16.243 22 14.828 22 12 22s-4.243 0-5.121-.879C6 20.243 6 18.828 6 16v-2M15 16.5H9M13 19H9" />
				<Path strokeLinejoin="round" d="M17 10" />
				<Path d="M17.983 17.983H18c1.553-.047 2.48-.22 3.121-.862C22 16.243 22 14.828 22 12s0-4.243-.879-5.121C20.243 6 18.828 6 16 6H8c-2.828 0-4.243 0-5.121.879C2 7.757 2 9.172 2 12s0 4.243.879 5.121c.641.642 1.568.815 3.121.862h.017" />
			</G>
		</Svg>
	);
}
