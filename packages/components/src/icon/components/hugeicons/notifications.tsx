import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgNotifications(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path strokeLinecap="round" strokeLinejoin="round" d="M16 18a4 4 0 0 1-8 0" />
				<Path d="M4.437 18h15.125c.728 0 1.092 0 1.303-.105a1 1 0 0 0 .531-1.106c-.05-.23-.277-.514-.731-1.082l-.17-.213c-.456-.57-.684-.854-.877-1.153a7 7 0 0 1-1.082-3.087c-.037-.354-.037-.719-.037-1.448V8.5c0-.464 0-.696-.012-.892a6 6 0 0 0-5.595-5.595C12.696 2 12.464 2 11.999 2c-.464 0-.696 0-.892.013a6 6 0 0 0-5.595 5.595c-.012.196-.012.428-.012.892v1.306c0 .73 0 1.094-.037 1.448a7 7 0 0 1-1.082 3.087c-.193.299-.421.584-.877 1.153l-.17.213c-.454.568-.682.852-.731 1.082a1 1 0 0 0 .531 1.106c.21.105.575.105 1.303.105Z" />
			</G>
		</Svg>
	);
}
