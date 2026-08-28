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
	React.useSyncExternalStore(model.subscribe, model.getLayout, model.getLayout);
	const { valueMax, valueMin, valueNow } = model.getSeparatorAriaValues(handleId);
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
