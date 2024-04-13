import * as React from 'react';

import WidgetBot from '@widgetbot/react-embed';

import Box from '@wcpos/components/src/box';
// import Button from '@wcpos/components/src/button';

const Support = () => {
	// const discordRef = React.useRef(null);

	// const handleSubmit = () => {
	// 	if (discordRef) {
	// 		discordRef.current.emit('sendMessage', `Hello world! from \`@widgetbot/react-embed\``);
	// 	}
	// };

	return (
		<Box padding="small" style={{ height: '100%' }}>
			{/* <Button onPress={handleSubmit} title="Submit" /> */}
			<WidgetBot
				server="711884517081612298"
				channel="1093100746372829254"
				shard="https://emerald.widgetbot.io"
				style={{ height: '100%', width: '100%', border: '0px' }}
				// onAPI={(api) => {
				// 	window.discordApi = api;
				// 	discordRef.current = api;
				// }}
			/>
		</Box>
	);
};

export default Support;
