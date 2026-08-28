/** @jest-environment jsdom */

import type { AccessibilityActionEvent } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { createPanelGroupModel } from '../model/PanelGroupModel';
import { useSeparatorA11y } from './useSeparatorA11y';

import type { PanelConstraints, PanelData } from '../Panel';

jest.mock('./useSeparatorA11y', () => jest.requireActual('./useSeparatorA11y.ts'));

function panel(id: string, constraints: PanelConstraints): PanelData {
	return {
		callbacks: {},
		constraints,
		id,
		idIsFromProps: true,
	};
}

function createModel() {
	const model = createPanelGroupModel({ direction: 'horizontal' });
	model.registerPanel(panel('left', { defaultSize: 50.4, minSize: 20.4, maxSize: 70.6 }));
	model.registerPanel(panel('right', { defaultSize: 49.6 }));
	model.registerHandle('handle');
	model.flush();
	return model;
}

function actionEvent(actionName: string): AccessibilityActionEvent {
	return { nativeEvent: { actionName } } as unknown as AccessibilityActionEvent;
}

test('reports rounded native accessibility values from the current layout', () => {
	const model = createModel();
	const { result } = renderHook(() =>
		useSeparatorA11y({
			direction: 'horizontal',
			disabled: false,
			handleId: 'handle',
			model,
		})
	);

	expect(result.current).toMatchObject({
		accessible: true,
		accessibilityRole: 'adjustable',
		accessibilityLabel: 'Resize handle, 50%',
		accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
		accessibilityValue: { min: 20, max: 71, now: 50 },
		accessibilityState: { disabled: false },
	});
});

test('increment and decrement nudge by five and update the label', () => {
	const model = createModel();
	const nudge = jest.spyOn(model, 'nudge');
	const { result } = renderHook(() =>
		useSeparatorA11y({
			direction: 'horizontal',
			disabled: false,
			handleId: 'handle',
			model,
		})
	);

	act(() => result.current.onAccessibilityAction?.(actionEvent('increment')));
	expect(nudge).toHaveBeenLastCalledWith('handle', 5);
	expect(result.current.accessibilityLabel).toBe('Resize handle, 55%');

	act(() => result.current.onAccessibilityAction?.(actionEvent('decrement')));
	expect(nudge).toHaveBeenLastCalledWith('handle', -5);
	expect(result.current.accessibilityLabel).toBe('Resize handle, 50%');
});

test('disabled handles ignore accessibility actions', () => {
	const model = createModel();
	const nudge = jest.spyOn(model, 'nudge');
	const { result } = renderHook(() =>
		useSeparatorA11y({
			direction: 'horizontal',
			disabled: true,
			handleId: 'handle',
			model,
		})
	);

	act(() => {
		result.current.onAccessibilityAction?.(actionEvent('increment'));
		result.current.onAccessibilityAction?.(actionEvent('decrement'));
	});

	expect(nudge).not.toHaveBeenCalled();
	expect(result.current.accessibilityState).toEqual({ disabled: true });
});
