import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgConfirmed(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} />
				<Path strokeLinejoin="round" d="m8.5 12.5 2 2 5-5" />
			</G>
		</Svg>
	);
}
