/** @jest-environment jsdom */
import * as React from 'react';
import type { ViewInstance } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { FilterChip } from './chip';

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
it('preserves the picker trigger ref and focuses its replacement after clearing', () => {
	const triggerRef = React.createRef<ViewInstance>();
	function Picker() {
		const [on, setOn] = React.useState(true);
		return (
			<FilterChip
				{...{ ref: triggerRef }}
				testID="chip"
				label="Status"
				on={on}
				onClear={on ? () => setOn(false) : undefined}
			/>
		);
	}
	render(<Picker />);
	expect(triggerRef.current).toBe(screen.getByTestId('chip'));
	fireEvent.click(screen.getByTestId('chip-clear'));
	expect(triggerRef.current).toBe(screen.getByTestId('chip'));
	expect(document.activeElement).toBe(triggerRef.current);
});
