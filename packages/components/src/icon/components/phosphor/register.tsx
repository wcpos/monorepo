import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRegister(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="m239.76 158.06-22.48-89.94A16 16 0 0 0 201.75 56H136V40a16 16 0 0 0-16-16H80a16 16 0 0 0-16 16v16h-9.75a16 16 0 0 0-15.53 12.12l-22.48 89.94A8 8 0 0 0 16 160v32a16 16 0 0 0 16 16h192a16 16 0 0 0 16-16v-32a8 8 0 0 0-.24-1.94M80 40h40v16H80ZM54.25 72h147.5l20 80H34.25ZM32 192v-24h192v24Zm32-96a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16H72a8 8 0 0 1-8-8m48 0a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16h-16a8 8 0 0 1-8-8m48 0a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16h-16a8 8 0 0 1-8-8m-96 32a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16H72a8 8 0 0 1-8-8m48 0a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16h-16a8 8 0 0 1-8-8m48 0a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16h-16a8 8 0 0 1-8-8"
			/>
		</Svg>
	);
}
