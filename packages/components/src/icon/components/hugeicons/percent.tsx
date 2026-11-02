import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPercent(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path strokeLinecap="round" d="M4 20 20 4" />
				<Path d="M8.268 4.732a2.5 2.5 0 1 1-3.536 3.536 2.5 2.5 0 0 1 3.536-3.536Zm11 11a2.5 2.5 0 1 1-3.536 3.536 2.5 2.5 0 0 1 3.536-3.536Z" />
			</G>
		</Svg>
	);
}
