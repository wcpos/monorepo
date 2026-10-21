import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCashier(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M11.995 13.566 11 13.5q-.532.015-1 .038c-3.7.181-6.716 3.268-7 6.962" />
				<Circle cx={11} cy={6.5} r={4} />
				<Path d="m17.898 15.006.66 1.241c.09.173.33.34.532.371l1.196.187c.765.12.945.642.394 1.157l-.93.875a.74.74 0 0 0-.195.64l.266 1.082c.21.858-.273 1.19-1.08.741l-1.12-.624a.86.86 0 0 0-.743 0l-1.121.624c-.803.448-1.29.113-1.08-.74l.266-1.084a.74.74 0 0 0-.195-.639l-.93-.875c-.547-.515-.37-1.037.394-1.157l1.196-.187a.8.8 0 0 0 .529-.37l.66-1.243c.36-.674.945-.674 1.3 0" />
			</G>
		</Svg>
	);
}
