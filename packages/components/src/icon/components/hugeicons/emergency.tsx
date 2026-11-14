import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgEmergency(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M12 7.5v9m3.897-6.75-7.794 4.5m7.794 0-7.794-4.5M6.479 6.77c-4.27 4.044-5.258 9.664-2.209 12.553 2.606 2.469 7.318 2.144 11.298-.527L20 20.5l-1.916-3.831c3.788-3.989 4.556-9.235 1.646-11.992-3.05-2.889-8.982-1.952-13.251 2.092"
			/>
		</Svg>
	);
}
