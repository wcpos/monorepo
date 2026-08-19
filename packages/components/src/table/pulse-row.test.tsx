import * as React from 'react';

import { render } from '@testing-library/react';

import { PulseTableRow } from './pulse-row';

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, ...props }: any) => React.createElement('div', props, children),
	},
	cancelAnimation: jest.fn(),
	useAnimatedStyle: () => ({}),
	useSharedValue: (value: any) => ({ value }),
	withSequence: jest.fn(),
	withTiming: jest.fn(),
}));

jest.mock('react-native-worklets', () => ({
	scheduleOnRN: jest.fn(),
}));

jest.mock('uniwind', () => ({
	useCSSVariable: () => ['#ffffff', '#eeeeee', '#007936', '#d40924'],
}));

describe('PulseTableRow', () => {
	it('never carries a CSS color transition — it would fight the reanimated pulse', () => {
		// Incident 2026-08-19: `web:transition-colors` on this row low-pass
		// filtered reanimated's per-frame backgroundColor updates, so the
		// add/remove pulse never reached the success/error color and visibly
		// lagged and snapped. The animated inline style also always overrides
		// class-based backgrounds, so a transition class buys nothing here.
		const { container } = render(
			<PulseTableRow
				row={{ id: 'row-1' } as any}
				table={{ options: { meta: {} } } as any}
				index={0}
			/>
		);

		const row = container.firstElementChild as HTMLElement;
		expect(row).not.toBeNull();
		expect(row.className).not.toMatch(/transition-colors/);
	});
});
