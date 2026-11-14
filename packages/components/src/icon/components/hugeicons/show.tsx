import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgShow(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path strokeLinecap="round" d="M2 8s4.477-5 10-5 10 5 10 5" />
				<Path d="M21.544 13.045c.304.426.456.64.456.955 0 .316-.152.529-.456.955C20.178 16.871 16.689 21 12 21c-4.69 0-8.178-4.13-9.544-6.045C2.152 14.529 2 14.315 2 14c0-.316.152-.529.456-.955C3.822 11.129 7.311 7 12 7c4.69 0 8.178 4.13 9.544 6.045Z" />
				<Path d="M15 14a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z" />
			</G>
		</Svg>
	);
}
