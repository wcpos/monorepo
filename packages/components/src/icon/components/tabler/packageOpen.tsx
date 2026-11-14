import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPackageOpen(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="m12 3 8 4.5v9L12 21l-8-4.5v-9zm0 9 8-4.5M12 12v9m0-9L4 7.5m12-2.25-8 4.5"
			/>
		</Svg>
	);
}
