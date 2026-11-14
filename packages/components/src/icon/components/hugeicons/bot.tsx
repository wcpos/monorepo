import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBot(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M12 4V2m8 20a8 8 0 1 0-16 0M9.375 8.25H9.25m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m5.375 0h-.125m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0" />
				<Path d="M15.154 4H8.846c-1.255 0-1.883 0-2.372.22A2.5 2.5 0 0 0 5.22 5.474C5 5.964 5 6.591 5 7.846c0 2.008 0 3.013.352 3.796a4 4 0 0 0 2.006 2.006C8.141 14 9.146 14 11.154 14h1.692c2.008 0 3.013 0 3.796-.352a4 4 0 0 0 2.006-2.006C19 10.859 19 9.854 19 7.846c0-1.255 0-1.883-.22-2.372a2.5 2.5 0 0 0-1.254-1.254C17.036 4 16.409 4 15.154 4" />
			</G>
		</Svg>
	);
}
