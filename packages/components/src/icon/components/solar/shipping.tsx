import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgShipping(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M9.565 8.73c-.485-1.755-.727-2.633-.315-3.324.411-.692 1.316-.927 3.126-1.398l1.92-.498c1.81-.47 2.715-.706 3.428-.307.713.4.956 1.277 1.44 3.033l.515 1.862c.485 1.755.728 2.633.316 3.325-.412.691-1.317.927-3.127 1.397l-1.92.499c-1.81.47-2.715.705-3.428.306-.713-.4-.955-1.277-1.44-3.032zM8.23 15.06 6.08 7.27c-.185-.653-.694-1.15-1.38-1.35L3 5.45" />
				<Circle cx={8.05} cy={18.1} r={2.9} />
				<Path d="M10.92 17.36 20 15" />
			</G>
		</Svg>
	);
}
