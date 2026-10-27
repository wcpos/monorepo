/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { WebVendorSegmented } from './web-vendor-segmented';

jest.mock('../printer-rows', () => ({
	PrinterRow: ({ children, verb }: { children?: React.ReactNode; verb?: React.ReactNode }) => (
		<div>
			{children}
			{verb}
		</div>
	),
}));

jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({ segments, value, onValueChange, testID }: any) => (
		<div data-testid={testID} role="radiogroup">
			{segments.map((segment: any) => (
				<button
					key={segment.value}
					type="button"
					data-testid={segment.testID}
					role="radio"
					aria-checked={segment.value === value ? 'true' : 'false'}
					disabled={segment.disabled}
					// As the real control: choosing the selected segment again is a no-op.
					onClick={() => segment.value !== value && onValueChange(segment.value)}
				>
					{segment.label}
				</button>
			))}
		</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../../../jest/translate')>(
				'../../../../../../../jest/translate'
			)
			.createTestT(),
}));

describe('WebVendorSegmented', () => {
	it('marks the selected vendor with an accessible and visible active state', () => {
		render(<WebVendorSegmented vendor="star" onSelect={jest.fn()} />);

		const segmented = screen.getByTestId('add-printer-vendor-segmented');
		const epson = screen.getByTestId('add-printer-vendor-epson');
		const star = screen.getByTestId('add-printer-vendor-star');

		expect(segmented).toHaveAttribute('role', 'radiogroup');

		expect(star).toHaveAttribute('aria-checked', 'true');
		expect(epson).toHaveAttribute('aria-checked', 'false');
	});
	it('moves the active state when the controlled vendor value changes', () => {
		const onSelect = jest.fn();
		const { rerender } = render(<WebVendorSegmented vendor="epson" onSelect={onSelect} />);

		fireEvent.click(screen.getByTestId('add-printer-vendor-star'));

		expect(onSelect).toHaveBeenCalledWith('star');

		rerender(<WebVendorSegmented vendor="star" onSelect={onSelect} />);

		expect(screen.getByTestId('add-printer-vendor-star')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('add-printer-vendor-epson')).toHaveAttribute('aria-checked', 'false');
	});

	it('does not show a supported web vendor as selected for unsupported values', () => {
		render(<WebVendorSegmented vendor="generic" onSelect={jest.fn()} />);

		expect(screen.getByTestId('add-printer-vendor-epson')).toHaveAttribute('aria-checked', 'false');
		expect(screen.getByTestId('add-printer-vendor-star')).toHaveAttribute('aria-checked', 'false');
	});
});
