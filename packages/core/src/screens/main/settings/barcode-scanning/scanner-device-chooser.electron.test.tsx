/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render } from '@testing-library/react';

import { ScannerDeviceChooser } from './scanner-device-chooser.electron';

let serialCb: ((devices: unknown) => void) | undefined;
let hidCb: ((devices: unknown) => void) | undefined;
const mockSend = jest.fn();
const mockUnsub = jest.fn();
const mockOn = jest.fn((channel: string, cb: (devices: unknown) => void) => {
	if (channel === 'serial-ports') serialCb = cb;
	if (channel === 'hid-devices') hidCb = cb;
	return mockUnsub;
});

jest.mock('react-native', () => {
	const R = require('react');
	return {
		Pressable: ({ children, onPress, testID }: Record<string, unknown>) =>
			R.createElement('button', { 'data-testid': testID, onClick: onPress }, children as never),
	};
});
jest.mock('@wcpos/components/button', () => {
	const R = require('react');
	return {
		Button: ({ children, onPress, testID }: Record<string, unknown>) =>
			R.createElement('button', { 'data-testid': testID, onClick: onPress }, children as never),
		ButtonText: ({ children }: Record<string, unknown>) =>
			R.createElement(R.Fragment, null, children),
	};
});
jest.mock('@wcpos/components/text', () => {
	const R = require('react');
	return {
		Text: ({ children }: Record<string, unknown>) => R.createElement('span', null, children),
	};
});
jest.mock('@wcpos/components/vstack', () => {
	const R = require('react');
	return {
		VStack: ({ children, testID }: Record<string, unknown>) =>
			R.createElement('div', { 'data-testid': testID }, children as never),
	};
});
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
}));

beforeEach(() => {
	serialCb = undefined;
	hidCb = undefined;
	mockSend.mockClear();
	mockUnsub.mockClear();
	(window as unknown as { ipcRenderer: unknown }).ipcRenderer = { on: mockOn, send: mockSend };
});

describe('ScannerDeviceChooser (electron)', () => {
	it('renders nothing until a chooser request arrives', () => {
		const { queryByTestId } = render(<ScannerDeviceChooser />);
		expect(queryByTestId('scanner-device-chooser')).toBeNull();
	});

	it('replies on the serial channel with the chosen port', () => {
		const { getByTestId } = render(<ScannerDeviceChooser />);
		act(() => serialCb?.([{ id: 's1', name: 'Scanner COM3' }]));
		fireEvent.click(getByTestId('scanner-device-s1'));
		expect(mockSend).toHaveBeenCalledWith('serial-port-selected', 's1');
	});

	it('cancels with an empty string on the serial channel', () => {
		const { getByTestId } = render(<ScannerDeviceChooser />);
		act(() => serialCb?.([{ id: 's1', name: 'Scanner COM3' }]));
		fireEvent.click(getByTestId('scanner-device-cancel'));
		expect(mockSend).toHaveBeenCalledWith('serial-port-selected', '');
	});

	it('cancels a pending serial chooser when an HID request arrives (no hang)', () => {
		render(<ScannerDeviceChooser />);
		act(() => serialCb?.([{ id: 's1', name: 'Serial' }]));
		act(() => hidCb?.([{ id: 'h1', name: 'HID' }]));
		expect(mockSend).toHaveBeenCalledWith('serial-port-selected', '');
	});

	it('cancels a pending chooser on unmount so the main process is not left blocked', () => {
		const { unmount } = render(<ScannerDeviceChooser />);
		act(() => hidCb?.([{ id: 'h1', name: 'HID' }]));
		mockSend.mockClear();
		unmount();
		expect(mockSend).toHaveBeenCalledWith('hid-device-selected', '');
	});
});
