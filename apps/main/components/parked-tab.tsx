import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { EmptyState } from '@wcpos/components/empty-state';
import { reloadApp } from '@wcpos/core/utils/reload-app';
import type { LiveTabState } from '@wcpos/database/live-tab/live-tab.web';

// No core.json/useT here: the translation provider loads from the user database,
// which a parked tab must never open. This screen precedes all app providers.
export const PARKED_TAB_COPY = {
	parked: ['The POS is open in another tab', 'Only one tab can run the register.'],
	waiting: ['Taking over…', 'Waiting for the other tab to hand over.'],
	payment: ['Taking over…', 'Waiting for the other tab to finish a payment.'],
	write: ['Taking over…', 'Waiting for the other tab to finish saving.'],
	'no-answer': ["The other tab isn't answering", 'Close it, or reload it, to continue here.'],
	lost: ['Local database unavailable', 'Reload to keep selling.'],
	takeOver: 'Take over here',
	reload: 'Reload the app',
} as const;
export function ParkedTab({
	state,
	takeOver,
}: {
	state: Extract<LiveTabState, { kind: 'parked' | 'taking-over' }>;
	takeOver(): void;
}) {
	const waiting = state.kind === 'taking-over';
	const lost = state.kind === 'parked' && state.reason === 'worker-lost';
	const [title, description] =
		PARKED_TAB_COPY[lost ? 'lost' : waiting ? (state.deferral ?? 'waiting') : 'parked'];
	return (
		<View
			testID="parked-tab"
			{...{
				dataSet: {
					state: waiting ? `taking-over:${state.deferral ?? 'waiting'}` : `parked:${state.reason}`,
				},
			}}
			className="bg-background flex-1 items-center justify-center p-6"
		>
			<EmptyState
				testID="parked-tab-content"
				kind={lost ? 'failed' : 'empty'}
				icon={lost ? undefined : 'circleInfo'}
				size="surface"
				className="flex-none"
				title={title}
				description={description}
			/>
			<Button
				testID={lost ? 'parked-tab-reload' : 'parked-tab-take-over'}
				className="min-h-12"
				disabled={waiting}
				onPress={lost ? reloadApp : takeOver}
			>
				<ButtonText testID="parked-tab-action-label">
					{lost ? PARKED_TAB_COPY.reload : PARKED_TAB_COPY.takeOver}
				</ButtonText>
			</Button>
		</View>
	);
}
