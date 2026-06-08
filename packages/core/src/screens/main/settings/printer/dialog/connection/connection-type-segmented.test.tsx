/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ConnectionTypeSegmented } from './connection-type-segmented';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
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
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

describe('ConnectionTypeSegmented', () => {
	it('renders only the platform-supported connection types passed by the dialog', () => {
		render(
			<ConnectionTypeSegmented value="network" onChange={jest.fn()} availableTypes={['network']} />
		);

		expect(screen.getByTestId('add-printer-connection-type-network')).toBeInTheDocument();
		expect(screen.queryByTestId('add-printer-connection-type-usb')).toBeNull();
		expect(screen.queryByTestId('add-printer-connection-type-bluetooth')).toBeNull();
		expect(screen.queryByTestId('add-printer-connection-type-cloud')).toBeNull();
	});

	it('emits stable connection-type values when selected', () => {
		const onChange = jest.fn();
		render(<ConnectionTypeSegmented value="network" onChange={onChange} />);

		fireEvent.click(screen.getByTestId('add-printer-connection-type-usb'));

		expect(onChange).toHaveBeenCalledWith('usb');
	});
});
