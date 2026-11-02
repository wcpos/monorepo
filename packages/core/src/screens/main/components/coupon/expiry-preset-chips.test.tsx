/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ExpiryPresetChips } from './expiry-preset-chips';
import { expiryPresetToDate } from './expiry-presets';

jest.mock('@wcpos/components/chip', () => ({
	Chip: ({
		label,
		on,
		onPress,
		testID,
	}: {
		label: string;
		on?: boolean;
		onPress?: () => void;
		testID?: string;
	}) => (
		<button data-testid={testID} data-on={String(!!on)} onClick={onPress}>
			{label}
		</button>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('./date-picker-input', () => ({ DatePickerInput: () => null }));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({ timezone: 'UTC' }),
}));
// The real date maths is pinned in expiry-presets.test.ts; here only "which preset is on".
jest.mock('./expiry-presets', () => ({
	expiryPresetToDate: (preset: string, timezone: string) => `${preset}@${timezone}`,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

it('marks Never as picked when the coupon has no expiry', () => {
	render(<ExpiryPresetChips value={null} onChange={jest.fn()} />);
	expect(screen.getByTestId('coupon-expiry-never').dataset.on).toBe('true');
	expect(screen.getByTestId('coupon-expiry-one_week').dataset.on).toBe('false');
});

it('marks the preset whose date the field holds, and sets that date on press', () => {
	const onChange = jest.fn();
	const oneWeek = expiryPresetToDate('one_week', 'UTC');
	render(<ExpiryPresetChips value={oneWeek} onChange={onChange} />);
	expect(screen.getByTestId('coupon-expiry-one_week').dataset.on).toBe('true');
	expect(screen.getByTestId('coupon-expiry-end_of_day').dataset.on).toBe('false');
	expect(screen.getByTestId('coupon-expiry-never').dataset.on).toBe('false');
	fireEvent.click(screen.getByTestId('coupon-expiry-one_month'));
	expect(onChange).toHaveBeenCalledWith(expiryPresetToDate('one_month', 'UTC'));
});
