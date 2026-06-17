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

	it('renders candidates and reports selection', () => {
		const onSelect = jest.fn();
		render(
			<ElectronBtPicker
				candidates={[
					{ id: 'a', name: 'Printer A' },
					{ id: 'b', name: '' },
				]}
				onSelect={onSelect}
			/>
		);
		expect(screen.getByText('Printer A')).toBeInTheDocument();
		// Unnamed devices fall back to their id.
		expect(screen.getByText('b')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('electron-bt-device-a'));
		expect(onSelect).toHaveBeenCalledWith('a');
	});
});
