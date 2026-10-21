import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgViewList(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M8 5.5h12m-12 7h12m-12 7h12" />
				<Path
					strokeLinejoin="round"
					d="M4.375 5.5H4.25m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m-.125 7H4.25m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m-.125 7H4.25m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0"
				/>
			</G>
		</Svg>
	);
}
