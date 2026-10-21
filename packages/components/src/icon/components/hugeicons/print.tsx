import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPrint(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M17 17h1.667c1.246 0 1.869 0 2.333-.268a2 2 0 0 0 .732-.732c.268-.464.268-1.087.268-2.333 0-2.493 0-3.739-.536-4.667A4 4 0 0 0 20 7.536C19.072 7 17.826 7 15.333 7H8.667C6.174 7 4.928 7 4 7.536A4 4 0 0 0 2.536 9C2 9.928 2 11.174 2 13.667c0 1.246 0 1.869.268 2.333a2 2 0 0 0 .732.732C3.464 17 4.087 17 5.333 17H7M17 7V5c0-1.414 0-2.121-.44-2.56C16.122 2 15.415 2 14 2h-4c-1.414 0-2.121 0-2.56.44C7 2.878 7 3.585 7 5v2" />
				<Path d="M17 14v5c0 1.414 0 2.121-.44 2.56-.439.44-1.146.44-2.56.44h-4c-1.414 0-2.121 0-2.56-.44C7 21.122 7 20.415 7 19v-5zm1.875-3.75h-.125m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0" />
			</G>
		</Svg>
	);
}
