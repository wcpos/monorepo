import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgProduct(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M16.207 21.207c.293-.293.293-.764.293-1.707v-10c0-.943 0-1.414-.293-1.707m0 13.414c-.293.293-.764.293-1.707.293h-10c-.943 0-1.414 0-1.707-.293S2.5 20.443 2.5 19.5v-10c0-.943 0-1.414.293-1.707m13.414 13.414 5-5c.293-.293.293-.764.293-1.707v-10c0-.943 0-1.414-.293-1.707m-5 5C15.914 7.5 15.443 7.5 14.5 7.5h-10c-.943 0-1.414 0-1.707.293m13.414 0 5-5m-18.414 5 5-5C8.086 2.5 8.557 2.5 9.5 2.5h10c.943 0 1.414 0 1.707.293"
			/>
		</Svg>
	);
}
