import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCustomers(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M16.5 20v-3.015c0-.621-.282-1.22-.816-1.536C14.157 14.546 12.17 14 10 14s-4.157.546-5.684 1.45c-.534.316-.816.914-.816 1.535V20"
				/>
				<Circle cx={10} cy={7.5} r={3.5} />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M20.5 20.001v-3.015c0-.621-.282-1.22-.816-1.536A9.7 9.7 0 0 0 18 14.668"
				/>
				<Path strokeLinecap="round" d="M15 4.145a3.502 3.502 0 0 1 0 6.71" />
			</G>
		</Svg>
	);
}
