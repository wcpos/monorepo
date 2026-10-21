import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSignOut(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M12 20a8 8 0 1 1 0-16" />
				<Path strokeLinejoin="round" d="M10 12h10m-3 3 3-3-3-3" />
			</G>
		</Svg>
	);
}
