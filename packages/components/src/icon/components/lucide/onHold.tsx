import * as React from 'react';

import Svg, { G, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgOnHold(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Rect width={5} height={18} x={14} y={3} rx={1} />
				<Rect width={5} height={18} x={5} y={3} rx={1} />
			</G>
		</Svg>
	);
}
