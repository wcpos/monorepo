import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgShipping(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Circle cx={17} cy={18} r={2} />
				<Circle cx={7} cy={18} r={2} />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M11 17h4M13.5 7h.943c1.31 0 1.966 0 2.521.315.556.314.926.895 1.667 2.056.52.814 1.064 1.406 1.831 1.931.772.53 1.14.789 1.343 1.204.195.398.195.869.195 1.811 0 1.243 0 1.864-.349 2.259l-.046.049c-.367.375-.946.375-2.102.375H19"
				/>
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="m13 7 .994 2.486c.487 1.217.73 1.826 1.239 2.17.508.344 1.163.344 2.475.344H21M4.87 17c-1.353 0-2.03 0-2.45-.44C2 16.122 2 15.415 2 14V7c0-1.414 0-2.121.42-2.56S3.517 4 4.87 4h5.26c1.353 0 2.03 0 2.45.44C13 4.878 13 5.585 13 7v10H8.696"
				/>
			</G>
		</Svg>
	);
}
