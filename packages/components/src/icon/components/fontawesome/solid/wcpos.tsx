import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgWcpos = (props: SvgProps) => (
	<Svg viewBox="0 0 1260 1260" {...props}>
		<Path d="M0 360c45 45 135 45 180 0 45 45 135 45 180 0 45 45 135 45 180 0 45 45 135 45 180 0 45 45 135 45 180 0 45 45 135 45 180 0 45 45 135 45 180 0v540q0 90-90 90H360L0 1260zM90 0h1080v90H90z" />
		<Path d="M0 90Q0 0 90 0h90v270a90 90 0 1 1-180 0ZM360 0h180v270a90 90 0 1 1-180 0ZM720 0h180v270a90 90 0 1 1-180 0ZM1080 0h90q90 0 90 90v180a90 90 0 1 1-180 0Z" />
		<Path
			fill="none"
			stroke="#FFF"
			strokeLinecap="round"
			strokeWidth={70}
			d="M130 923.5V532m0 130.5a130.5 130.5 0 1 0 261 0 130.5 130.5 0 1 0-261 0M499 662a131 131 0 1 0 262 0 131 131 0 1 0-262 0M1131 565.8c-21.75-13.05-65.25-34.8-130.5-34.8Q870 531 870 596.25t130.5 65.25 130.5 65.25T1000.5 792c-65.25 0-108.75-21.75-130.5-34.8"
		/>
	</Svg>
);
export default SvgWcpos;
