/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { LevelBack } from './level-back';

jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
// The pan's end handler, as the last LevelBack rendered registered it.
let mockSwipeEnd: ((event: { translationX: number }) => void) | undefined;
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }: React.PropsWithChildren) => children,
	Gesture: {
		Pan: () => {
			const pan = {
				runOnJS: () => pan,
				enabled: () => pan,
				hitSlop: () => pan,
				activeOffsetX: () => pan,
				failOffsetY: () => pan,
				onEnd: (handler: (event: { translationX: number }) => void) => {
					mockSwipeEnd = handler;
					return pan;
				},
			};
			return pan;
		},
	},
}));
const mockInOneBatch = jest.fn((update: () => void) => update());
jest.mock('./one-batch', () => ({
	inOneBatch: (update: () => void) => mockInOneBatch(update),
}));

it('Escape goes back and stops there', () => {
	const onBack = jest.fn();
	const outer = jest.fn();
	render(
		<div onKeyDown={outer}>
			<LevelBack onBack={onBack} testID="level">
				<span />
			</LevelBack>
		</div>
	);
	fireEvent.keyDown(screen.getByTestId('level'), { key: 'Escape' });
	expect(onBack).toHaveBeenCalledTimes(1);
	expect(outer).not.toHaveBeenCalled();
});
it('ignores other keys', () => {
	const onBack = jest.fn();
	render(
		<LevelBack onBack={onBack} testID="level">
			<span />
		</LevelBack>
	);
	fireEvent.keyDown(screen.getByTestId('level'), { key: 'Enter' });
	expect(onBack).not.toHaveBeenCalled();
});
it('a level inside a level: one Escape goes back from the deepest only', () => {
	const outerBack = jest.fn();
	const innerBack = jest.fn();
	render(
		<LevelBack onBack={outerBack} testID="outer">
			<LevelBack onBack={innerBack} testID="inner">
				<span />
			</LevelBack>
		</LevelBack>
	);
	fireEvent.keyDown(screen.getByTestId('inner'), { key: 'Escape' });
	expect(innerBack).toHaveBeenCalledTimes(1);
	expect(outerBack).not.toHaveBeenCalled();
});
it('the edge swipe goes back in one batch (it is not a discrete event), and only past its threshold', () => {
	const onBack = jest.fn();
	render(
		<LevelBack onBack={onBack} testID="level">
			<span />
		</LevelBack>
	);
	mockSwipeEnd?.({ translationX: 10 });
	expect(onBack).not.toHaveBeenCalled();
	mockSwipeEnd?.({ translationX: 40 });
	expect(mockInOneBatch).toHaveBeenCalledWith(onBack);
	expect(onBack).toHaveBeenCalledTimes(1);
});
