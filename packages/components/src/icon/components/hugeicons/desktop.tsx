import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDesktop(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M15.992 21h-8m8-18h-8c-2.828 0-4.242 0-5.121.879-.879.878-.879 2.293-.879 5.121v2c0 2.828 0 4.243.879 5.121S5.164 17 7.992 17h8c2.829 0 4.243 0 5.121-.879.88-.878.88-2.293.88-5.121V9c0-2.828 0-4.243-.88-5.121C20.236 3 18.822 3 15.993 3"
				/>
				<Path d="M10.492 21v-4m3 0v4" />
			</G>
		</Svg>
	);
}
