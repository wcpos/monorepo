import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';

export function SvgLock(props: SvgProps) {
	return (
		<Svg viewBox="0 0 24 24" {...props}>
			<Path
				fillRule="evenodd"
				d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"
			/>
		</Svg>
	);
}
