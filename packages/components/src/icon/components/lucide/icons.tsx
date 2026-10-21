import * as React from 'react';

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgIcons(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
				<Rect width={7} height={7} x={3} y={14} rx={1} />
				<Circle cx={17.5} cy={17.5} r={3.5} />
			</G>
		</Svg>
	);
}
