'use dom';

import WidgetBot from '@widgetbot/react-embed';

import type { DOMProps } from 'expo/dom';

interface DiscordProps {
	dom?: DOMProps;
	width?: number;
	height?: number;
}

export default function Discord({ dom, width, height }: DiscordProps) {
	return (
		<WidgetBot
			server="711884517081612298"
			channel="1093100746372829254"
			shard="https://emerald.widgetbot.io"
			style={{
				flex: 1,
				width: width ? width : '100%',
				height: height ? height : '100%',
			}}
		/>
	);
}
