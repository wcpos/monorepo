import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCategories(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth={1.5}
				d="M7.5 9.056h8.775c1.896 0 2.844 0 3.525.45.295.194.548.444.745.735.455.672.455 1.609.455 3.481 0 3.121 0 4.682-.758 5.803-.329.485-.75.902-1.242 1.226-1.135.75-2.715.75-5.875.75H12c-4.243 0-6.364 0-7.682-1.303C3 18.897 3 16.802 3 12.611V9.895c0-1.615 0-2.422.342-3.028a2.7 2.7 0 0 1 1.042-1.029C4.998 5.5 5.815 5.5 7.45 5.5c1.047 0 1.57 0 2.03.17 1.046.388 1.478 1.327 1.95 2.26L12 9.056M3 2.5h5.5c.97 0 1.918-.028 2.739.555 1.051.748 1.471 2.142 2.522 2.89.82.583 1.769.555 2.739.555H21"
			/>
		</Svg>
	);
}
