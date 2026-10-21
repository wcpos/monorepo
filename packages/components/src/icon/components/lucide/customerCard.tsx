import * as React from 'react';

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCustomerCard(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M13 19a4 4 0 0 0-8 0m11-9h2m-2 4h2" />
				<Circle cx={9} cy={12} r={3} />
				<Rect width={20} height={14} x={2} y={5} rx={2} />
			</G>
		</Svg>
	);
}
