import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgOnHold(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} />
				<Path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9v6m5-6v6" />
			</G>
		</Svg>
	);
}
