import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAddCustomer(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={6} r={4} />
				<Path strokeLinejoin="round" d="M18 14.667v2.666M16.667 16h2.666" />
				<Path d="M22 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
				<Path d="M15.02 13.332A13.6 13.6 0 0 0 12 13c-4.418 0-8 2.015-8 4.5S4 22 12 22c5.58 0 7.268-.98 7.778-2.416" />
			</G>
		</Svg>
	);
}
