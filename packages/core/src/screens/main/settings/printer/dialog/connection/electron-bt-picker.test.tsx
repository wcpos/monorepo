/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ElectronBtPicker } from './electron-bt-picker';

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
	}) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
	}) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		`${key}${values ? JSON.stringify(values) : ''}`,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

describe('ElectronBtPicker', () => {
	it('renders nothing with no candidates', () => {
		const { container } = render(<ElectronBtPicker candidates={[]} onSelect={jest.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('ranks printer-like names first, hides unnamed devices behind a toggle, reports selection', () => {
		const onSelect = jest.fn();
		render(
			<ElectronBtPicker
				candidates={[
					{ id: 'c', name: '' },
					{ id: 'p', name: 'Paul’s Phone' },
					{ id: 'a', name: 'Printer A' },
				]}
				onSelect={onSelect}
			/>
		);
		const buttons = screen.getAllByTestId(/electron-bt-device-/);
		expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
			'electron-bt-device-a',
			'electron-bt-device-p',
		]);
		expect(screen.getByText('settings.bt_likely_printer')).toBeInTheDocument();
		expect(screen.queryByText('c')).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId('electron-bt-toggle-unnamed'));
		// Unnamed devices fall back to their id once shown.
		expect(screen.getByText('c')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('electron-bt-device-a'));
		expect(onSelect).toHaveBeenCalledWith('a');
	});
});
