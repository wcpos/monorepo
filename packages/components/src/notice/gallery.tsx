import type * as React from 'react';
import { View } from 'react-native';

import { Notice } from './index';

const outage: React.ComponentProps<typeof Notice> = {
	tone: 'bad',
	title: 'Local database unavailable',
	description: 'Scanning, checkout, saving and voiding are blocked until the app is reloaded.',
	actions: [
		{ label: 'Reload the app', onPress: () => {} },
		{ label: 'View status', onPress: () => {} },
	],
};
const examples = {
	warn: <Notice tone="warn" title="Offline, still selling" description="3 sales waiting to sync" />,
	info: <Notice tone="info" title="Syncing with server…" />,
	bad: <Notice {...outage} testID="gallery-notice-bad" />,
	docs: (
		<Notice
			tone="warn"
			title="Your store changed this order's totals"
			docs={{ label: 'Learn more', href: 'https://docs.wcpos.com' }}
			testID="gallery-notice-docs"
		/>
	),
	narrow: (
		<View className="w-64">
			<Notice {...outage} testID="gallery-notice-narrow" />
		</View>
	),
};
export const stories = Object.entries(examples).map(([id, element]) => ({
	id,
	render: () => element,
}));
