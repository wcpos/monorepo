import type * as React from 'react';
import { View } from 'react-native';

import { FallbackScreen } from '../error-boundary/fallback-screen';
import { GateScreen } from './index';

const noop = () => {};
const examples: ({ id: string } & React.ComponentProps<typeof GateScreen>)[] = [
	{
		id: 'update',
		tone: 'warn',
		title: 'Update the POS app on this device.',
		description:
			'The WCPOS plugin on your WordPress site is newer than the app in this tab. Reload the page to load the latest version.',
		primary: { label: 'Reload', onPress: noop },
		secondary: { label: 'Logout', onPress: noop },
		docs: { label: 'Learn more', href: 'https://docs.wcpos.com', code: 'SYNC341' },
	},
	{
		id: 'plugin',
		tone: 'warn',
		title: 'Update the WCPOS plugin on your WordPress site.',
		description:
			'The POS app on this device is newer than the plugin the store is running. In WordPress open Plugins, update WCPOS, then log in again.',
		secondary: { label: 'Logout', onPress: noop },
	},
	{
		id: 'crash',
		tone: 'bad',
		title: 'Something went wrong.',
		description: 'Reload to start the POS again. Unsent sales stay on this device.',
		detail: "TypeError: Cannot read properties of undefined (reading 'line_items')",
		primary: { label: 'Reload', onPress: noop },
		docs: { label: 'Learn more', href: 'https://docs.wcpos.com', code: 'CLIENT151' },
	},
	{
		id: 'parked',
		tone: 'muted',
		title: 'The POS is open in another tab',
		description: 'Only one tab can run the register.',
		primary: { label: 'Take over here', onPress: noop },
	},
	{
		id: 'taking-over',
		tone: 'muted',
		title: 'Taking over…',
		description: 'Waiting for the other tab to finish a payment.',
		primary: { label: 'Take over here', onPress: noop, disabled: true },
	},
	{
		id: 'destructive-confirm',
		tone: 'bad',
		title: 'Reset app data and restart?',
		primary: { label: 'Reset and restart', onPress: noop, destructive: true },
		secondary: { label: 'Cancel', onPress: noop },
	},
	{
		id: 'not-found',
		tone: 'muted',
		icon: 'help',
		title: "This screen doesn't exist.",
		description: 'The address may be out of date.',
		primary: { label: 'Back to the start', onPress: noop },
	},
];
// A gate owns the whole screen (`flex-1`), so each cell gives it a screen-sized stage.
export const stories = [
	...examples.map(({ id, ...props }) => ({
		id,
		render: () => (
			<View className="h-160 w-full">
				<GateScreen {...props} testID={`gallery-gate-screen-${id}`} />
			</View>
		),
	})),
	{
		// A route boundary's fallback: the same gate, the thrown message clipped in the detail.
		id: 'fallback-screen',
		render: () => (
			<View className="h-160 w-full">
				<FallbackScreen
					error={new TypeError("Cannot read properties of undefined (reading 'line_items')")}
					resetErrorBoundary={noop}
				/>
			</View>
		),
	},
];
