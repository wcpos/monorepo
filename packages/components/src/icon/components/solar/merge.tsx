import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMerge(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M8 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM15 19.004a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 15.999V12" />
				<Path d="M5 8c0 1.886 0 2.828 1.025 3.414S8.7 12 12 12s4.95 0 5.975-.586S19 9.886 19 8" />
			</G>
		</Svg>
	);
}
