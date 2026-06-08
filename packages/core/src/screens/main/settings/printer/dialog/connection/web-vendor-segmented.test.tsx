/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { WebVendorSegmented } from './web-vendor-segmented';

jest.mock('@wcpos/components/tabs', () => {
	const React = require('react');
	const TabsContext = React.createContext({
		value: '',
		onValueChange: (_value: string) => undefined,
	});
	return {
		Tabs: ({ children, value, onValueChange }: any) => (
			<TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>
		),
		TabsList: ({ children, testID }: any) => (
			<div data-testid={testID} role="tablist">
				{children}
			</div>
		),
		TabsTrigger: ({ children, value, testID }: any) => {
			const context = React.useContext(TabsContext);
			const selected = context.value === value;
			return (
				<button
					type="button"
					data-testid={testID}
					role="tab"
					aria-selected={selected ? 'true' : 'false'}
					onClick={() => context.onValueChange(value)}
				>
					{children}
				</button>
			);
		},
	};
});

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

describe('WebVendorSegmented', () => {
	it('marks the selected vendor with an accessible and visible active state', () => {
		render(<WebVendorSegmented vendor="star" onSelect={jest.fn()} />);

		const segmented = screen.getByTestId('add-printer-vendor-segmented');
		const epson = screen.getByTestId('add-printer-vendor-epson');
		const star = screen.getByTestId('add-printer-vendor-star');

		expect(segmented).toHaveAttribute('role', 'tablist');

		expect(star).toHaveAttribute('aria-selected', 'true');
		expect(epson).toHaveAttribute('aria-selected', 'false');
	});
	it('moves the active state when the controlled vendor value changes', () => {
		const onSelect = jest.fn();
		const { rerender } = render(<WebVendorSegmented vendor="epson" onSelect={onSelect} />);

		fireEvent.click(screen.getByTestId('add-printer-vendor-star'));

		expect(onSelect).toHaveBeenCalledWith('star');

		rerender(<WebVendorSegmented vendor="star" onSelect={onSelect} />);

		expect(screen.getByTestId('add-printer-vendor-star')).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByTestId('add-printer-vendor-epson')).toHaveAttribute(
			'aria-selected',
			'false'
		);
	});

	it('does not show a supported web vendor as selected for unsupported values', () => {
		render(<WebVendorSegmented vendor="generic" onSelect={jest.fn()} />);

		expect(screen.getByTestId('add-printer-vendor-epson')).toHaveAttribute(
			'aria-selected',
			'false'
		);
		expect(screen.getByTestId('add-printer-vendor-star')).toHaveAttribute('aria-selected', 'false');
	});
});
