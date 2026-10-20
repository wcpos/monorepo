import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCard(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Rect width={20} height={14} x={2} y={5} rx={2} />
				<Path d="M2 10h20M6 14h2" />
			</G>
		</Svg>
	);
}
