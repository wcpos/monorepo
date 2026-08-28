import React from 'react';

import type { PanelGroupModel } from '../model/PanelGroupModel';
import type { Direction } from '../types';

type SeparatorKeyEvent = {
	defaultPrevented: boolean;
	key: string;
	preventDefault: () => void;
};

type SeparatorA11yOptions = {
	direction: Direction;
	disabled: boolean;
	handleId: string;
	model: PanelGroupModel;
};

export type SeparatorA11yProps = {
	role: 'separator';
	'aria-orientation': Direction;
	'aria-valuemax': number | undefined;
	'aria-valuemin': number | undefined;
	'aria-valuenow': number | undefined;
	tabIndex: 0 | undefined;
	onKeyDown: (event: SeparatorKeyEvent) => void;
};

export function useSeparatorA11y({
	direction,
	disabled,
	handleId,
	model,
}: SeparatorA11yOptions): SeparatorA11yProps {
	React.useSyncExternalStore(model.subscribe, model.getLayout, model.getLayout);
	const { valueMax, valueMin, valueNow } = model.getSeparatorAriaValues(handleId);
	const onKeyDown = React.useCallback(
		(event: SeparatorKeyEvent) => {
			if (disabled || event.defaultPrevented) return;
			let action: (() => void) | undefined;
			switch (event.key) {
				case 'ArrowLeft':
					if (direction === 'horizontal') action = () => model.nudge(handleId, -5);
					break;
				case 'ArrowRight':
					if (direction === 'horizontal') action = () => model.nudge(handleId, 5);
					break;
				case 'ArrowUp':
					if (direction === 'vertical') action = () => model.nudge(handleId, -5);
					break;
				case 'ArrowDown':
					if (direction === 'vertical') action = () => model.nudge(handleId, 5);
					break;
				case 'Home':
					action = () => model.nudge(handleId, -100);
					break;
				case 'End':
					action = () => model.nudge(handleId, 100);
					break;
				case 'Enter':
					action = () => model.toggleCollapseAdjacent(handleId);
					break;
			}
			if (action) {
				event.preventDefault();
				action();
			}
		},
		[direction, disabled, handleId, model]
	);

	return {
		role: 'separator',
		'aria-orientation': direction,
		'aria-valuemax': valueMax,
		'aria-valuemin': valueMin,
		'aria-valuenow': valueNow,
		tabIndex: disabled ? undefined : 0,
		onKeyDown,
	};
}
