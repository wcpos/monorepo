import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgWarehouse(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M7 22v-8c0-1.886 0-2.828.586-3.414S9.114 10 11 10h2c1.886 0 2.828 0 3.414.586S17 12.114 17 14v8zm0-8h10M7 18h10" />
				<Path d="m18.129 5.232-3-1.835C13.606 2.466 12.844 2 12 2s-1.606.466-3.129 1.397l-3 1.835c-1.403.858-2.104 1.287-2.488 1.971S3 8.71 3 10.356v5.64c0 2.83 0 4.245.879 5.125C4.757 22 6.172 22 9 22h6c2.828 0 4.243 0 5.121-.88.879-.879.879-2.294.879-5.125v-5.64c0-1.645 0-2.468-.383-3.152-.384-.684-1.085-1.113-2.488-1.971" />
			</G>
		</Svg>
	);
}
