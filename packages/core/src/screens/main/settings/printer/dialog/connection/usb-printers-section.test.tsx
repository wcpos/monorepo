/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { UsbPrintersSection } from './usb-printers-section';

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
		loading,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button type="button" data-testid={testID} disabled={!!disabled || !!loading} onClick={onPress}>
			{children}
		</button>
	),
}));

describe('UsbPrintersSection', () => {
	it('auto-loads on mount: onScan called exactly once', () => {
		const onScan = jest.fn();
		render(<UsbPrintersSection onScan={onScan} />);
		expect(onScan).toHaveBeenCalledTimes(1);
	});

	it('button renders "Refresh" and clicking calls onScan again (total 2)', () => {
		const onScan = jest.fn();
		render(<UsbPrintersSection onScan={onScan} />);
		const btn = screen.getByTestId('add-printer-electron-usb-scan-button');
		expect(btn).toBeInTheDocument();
		expect(btn).toHaveTextContent('Refresh');
		fireEvent.click(btn);
		expect(onScan).toHaveBeenCalledTimes(2);
	});

	it('scanning prop disables the button', () => {
		const onScan = jest.fn();
		render(<UsbPrintersSection onScan={onScan} scanning={true} />);
		const btn = screen.getByTestId('add-printer-electron-usb-scan-button');
		expect(btn).toBeDisabled();
	});

	it('renders children', () => {
		const onScan = jest.fn();
		render(
			<UsbPrintersSection onScan={onScan}>
				<span data-testid="child-node">child</span>
			</UsbPrintersSection>
		);
		expect(screen.getByTestId('child-node')).toBeInTheDocument();
	});

	it('no onScan prop — no button rendered, no crash', () => {
		render(<UsbPrintersSection />);
		expect(screen.queryByTestId('add-printer-electron-usb-scan-button')).not.toBeInTheDocument();
	});
});
