import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAddToCart(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M16 5h6m-3-3v6M2.05 2.05l1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18M4.564 5H12" />
				<Path d="M6.25 14h12.712a2 2 0 0 0 1.991-1.57l.172-1.041" />
				<Circle cx={18} cy={20} r={2} />
				<Circle cx={8} cy={20} r={2} />
			</G>
		</Svg>
	);
}
