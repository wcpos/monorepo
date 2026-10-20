import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCash(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M2.017 13.5C4.217 13.5 6 15.283 6 17.483m12 0v-.092a3.89 3.89 0 0 1 3.89-3.891M6 3.516c0 2.2-1.783 3.982-3.983 3.982M18 3.516c0 2.18 1.769 3.951 3.942 3.982" />
				<Path d="M16 3.5H8c-2.828 0-4.243 0-5.121.879C2 5.257 2 6.672 2 9.5v2c0 2.828 0 4.243.879 5.121.878.879 2.293.879 5.121.879h8c2.828 0 4.243 0 5.121-.879C22 15.743 22 14.328 22 11.5v-2c0-2.828 0-4.243-.879-5.121C20.243 3.5 18.828 3.5 16 3.5m-11 17h14" />
				<Path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
			</G>
		</Svg>
	);
}
