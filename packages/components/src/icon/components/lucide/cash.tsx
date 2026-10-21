import * as React from 'react';

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCash(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Rect width={20} height={12} x={2} y={6} rx={2} />
				<Circle cx={12} cy={12} r={2} />
				<Path d="M6 12h.01M18 12h.01" />
			</G>
		</Svg>
	);
}
