import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgInvoice(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M28 128a8 8 0 0 1 0-16h28a8 8 0 0 0 0-16H40a24 24 0 0 1 0-48 8 8 0 0 1 16 0h8a8 8 0 0 1 0 16H40a8 8 0 0 0 0 16h16a24 24 0 0 1 0 48 8 8 0 0 1-16 0Zm204-72v136a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16v-40a8 8 0 0 1 16 0v40h120v-32H80a8 8 0 0 1 0-16h80v-32h-56a8 8 0 0 1 0-16h112V64H96a8 8 0 0 1 0-16h128a8 8 0 0 1 8 8m-56 88h40v-32h-40Zm40 48v-32h-40v32Z"
			/>
		</Svg>
	);
}
