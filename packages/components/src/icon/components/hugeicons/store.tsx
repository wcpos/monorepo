import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgStore(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M3.5 10v5c0 2.828 0 4.243.879 5.121C5.257 21 6.672 21 9.5 21h5c2.828 0 4.243 0 5.121-.879.879-.878.879-2.293.879-5.121v-5" />
				<Path d="M17 7.502a2.5 2.5 0 0 1-5-.002 2.5 2.5 0 0 1-5 0C7 8.88 5.827 10 4.379 10c-.78 0-1.479-.324-1.959-.84-.825-.884-.294-2.186.394-3.172l.388-.53c.882-1.205 1.323-1.808 1.963-2.133S6.552 3 8.045 3l7.91.001c1.493 0 2.24 0 2.88.326.64.324 1.08.927 1.962 2.133l.389.53c.688.986 1.22 2.288.394 3.173a2.67 2.67 0 0 1-1.959.839c-1.448 0-2.621-1.12-2.621-2.5M14.997 17c-.684.607-1.772 1-2.998 1S9.684 17.607 9 17" />
			</G>
		</Svg>
	);
}
