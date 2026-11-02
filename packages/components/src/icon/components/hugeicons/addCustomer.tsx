import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAddCustomer(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M13 13.503A12.2 12.2 0 0 0 9.5 13c-1.778 0-3.431.366-4.81.995C3.56 14.51 3 15.728 3 16.97V19"
				/>
				<Circle cx={9.5} cy={6.5} r={3.5} />
				<Path strokeLinecap="round" strokeLinejoin="round" d="M17.5 21v-7M14 17.5h7" />
			</G>
		</Svg>
	);
}
