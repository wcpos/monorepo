import * as React from 'react';
import { View } from 'react-native';

import { PreThemeGate } from './pre-theme-gate';
import { ROOT_ERROR_COPY as COPY } from './root-error-copy';

import type { Story } from './gallery/cells';

const noop = () => {};

// The pre-theme gate is always the light theme: it renders before any theme exists, so every
// theme's cell is the same picture by design. Each cell gives it a screen-sized stage.
export const stories: Story[] = [
	{
		id: 'crash',
		render: () => (
			<View className="h-160 w-full">
				<PreThemeGate
					testID="gallery-pre-theme-gate-crash"
					tone="bad"
					title={COPY.crashTitle}
					description={COPY.crashLine}
					detail="TypeError: Cannot read properties of undefined (reading 'line_items')"
					primary={{ label: COPY.tryAgain, onPress: noop }}
					secondary={{ label: COPY.reset, onPress: noop }}
				/>
			</View>
		),
	},
	{
		id: 'reset-blocked',
		render: () => (
			<View className="h-160 w-full">
				<PreThemeGate
					testID="gallery-pre-theme-gate-reset-blocked"
					tone="warn"
					title="Reset didn’t finish"
					description="The local data reset did not complete. Reload the page to retry — nothing new can be saved until it finishes."
					primary={{ label: 'Reload and retry', onPress: noop }}
				/>
			</View>
		),
	},
];
