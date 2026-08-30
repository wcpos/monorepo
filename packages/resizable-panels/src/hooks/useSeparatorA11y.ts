import * as React from 'react';
import type { ViewProps } from 'react-native';

import type { PanelGroupModel } from '../model/PanelGroupModel';
import type { Direction } from '../types';

type SeparatorA11yOptions = {
	direction: Direction;
	disabled: boolean;
	handleId: string;
	model: PanelGroupModel;
};

export type SeparatorA11yProps = Pick<
	ViewProps,
	| 'accessible'
	| 'accessibilityRole'
	| 'accessibilityValue'
	| 'accessibilityLabel'
	| 'accessibilityActions'
	| 'onAccessibilityAction'
	| 'accessibilityState'
>;

export function useSeparatorA11y({
	disabled,
	handleId,
	model,
}: SeparatorA11yOptions): SeparatorA11yProps {
	// Read the values THROUGH the store hook. A bare `useSyncExternalStore(...,
	// getVersion)` whose result is discarded leaves `model.getSeparatorAriaValues`
	// with no reactive input the React Compiler can see, so it memoises the first
	// render's (empty) result on [model, handleId] for the life of the handle —
	// on native the label stayed "Resize handle" with no percentage for the whole
	// session (iPad, 2026-08-30). The model returns a version-stable snapshot.
	const getSnapshot = React.useCallback(
		() => model.getSeparatorAriaValues(handleId),
		[handleId, model]
	);
	const { valueMax, valueMin, valueNow } = React.useSyncExternalStore(
		model.subscribe,
		getSnapshot,
		getSnapshot
	);
	const onAccessibilityAction: NonNullable<SeparatorA11yProps['onAccessibilityAction']> = (
		event
	) => {
		if (disabled) return;
		switch (event.nativeEvent.actionName) {
			case 'increment':
				model.nudge(handleId, 5);
				break;
			case 'decrement':
				model.nudge(handleId, -5);
				break;
		}
	};

	return {
		accessible: true,
		accessibilityRole: 'adjustable',
		accessibilityValue: {
			...(valueMin === undefined ? {} : { min: Math.round(valueMin) }),
			...(valueMax === undefined ? {} : { max: Math.round(valueMax) }),
			...(valueNow === undefined ? {} : { now: Math.round(valueNow) }),
		},
		accessibilityLabel:
			valueNow === undefined ? 'Resize handle' : `Resize handle, ${Math.round(valueNow)}%`,
		accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
		onAccessibilityAction,
		accessibilityState: { disabled },
	};
}
