import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgReports(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path
					strokeLinejoin="round"
					d="m7 15.246 2.874-3.714c.25-.324.375-.486.512-.597a1.46 1.46 0 0 1 1.45-.232c.164.062.33.177.664.407s.5.345.663.408c.49.19 1.04.1 1.45-.233.138-.11.263-.273.513-.596l.78-1.008c.977-1.263 1.466-1.895 2.135-1.933.67-.038 1.223.533 2.33 1.677l.629.651"
				/>
				<Path d="M21 21H10c-3.3 0-4.95 0-5.975-1.025S3 17.3 3 14V3" />
			</G>
		</Svg>
	);
}
