/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { WebVendorSegmented } from './web-vendor-segmented';

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		className,
		accessibilityRole,
		accessibilityState,
		onPress,
		testID,
	}: any) => (
		<button
			type="button"
			className={className}
			data-testid={testID}
			role={accessibilityRole}
			aria-selected={accessibilityState?.selected ? 'true' : 'false'}
			onClick={onPress}
		>
			{children}
		</button>
	),
	View: ({ children, className, testID, accessibilityRole }: any) => (
		<div className={className} data-testid={testID} role={accessibilityRole}>
			{children}
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
		expect(star).toHaveClass('border-primary', 'bg-background', 'shadow-sm');
		expect(star.firstElementChild).toHaveClass('text-primary', 'font-semibold');

		expect(epson).toHaveAttribute('aria-selected', 'false');
		expect(epson).toHaveClass('border-transparent');
		expect(epson.firstElementChild).toHaveClass('text-muted-foreground');
	});
	it('moves the active state immediately when a vendor is clicked', () => {
		const onSelect = jest.fn();
		render(<WebVendorSegmented vendor="epson" onSelect={onSelect} />);

		fireEvent.click(screen.getByTestId('add-printer-vendor-star'));

		expect(onSelect).toHaveBeenCalledWith('star');
		expect(screen.getByTestId('add-printer-vendor-star')).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByTestId('add-printer-vendor-epson')).toHaveAttribute(
			'aria-selected',
			'false'
		);
	});
});
