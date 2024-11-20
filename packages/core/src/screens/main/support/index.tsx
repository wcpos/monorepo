import * as React from 'react';

import WidgetBot from '@widgetbot/react-embed';

import { Box } from '@wcpos/components/src/box';

const Support = () => {
	return (
		<Box className="h-full">
			<WidgetBot
				server="711884517081612298"
				channel="1093100746372829254"
				shard="https://emerald.widgetbot.io"
				style={{ height: '100%', width: '100%', border: '0px' }}
			/>
		</Box>
	);
};

export default Support;
