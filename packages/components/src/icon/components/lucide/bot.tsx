import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBot(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M12 8V4H8" />
				<Rect width={16} height={12} x={4} y={8} rx={2} />
				<Path d="M2 14h2m16 0h2m-7-1v2m-6-2v2" />
			</G>
		</Svg>
	);
}
