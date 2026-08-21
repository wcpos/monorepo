/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useCameraScan } from './use-camera-scan';

const mockEmit = jest.fn();
let mockSegments: string[] = ['(app)', '(drawer)', '(pos)'];

jest.mock('expo-router', () => ({
	useSegments: () => mockSegments,
}));
jest.mock('../../hooks/barcodes/scan-hub-context', () => ({
	useScanHub: () => ({
		emit: mockEmit,
		registerSource: jest.fn(),
		events$: { subscribe: () => ({ unsubscribe() {} }) },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: () => 8,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../hooks/barcodes/too-short-feedback', () => ({
	showTooShortFeedback: jest.fn(),
}));

// The scan-session may hold a code for repeat-confirmation; a real camera
// stream re-offers every frame, so offering repeatedly mirrors production.
function offerRepeatedly(onScan: (result: { data: string; type?: string }) => void, code: string) {
	for (let i = 0; i < 3; i++) {
		onScan({ data: code, type: 'qr' });
	}
}

describe('useCameraScan POS-section gate (#1438 ruling)', () => {
	beforeEach(() => {
		mockEmit.mockClear();
	});

	it('emits camera scans onto the hub while the POS section is active', () => {
		mockSegments = ['(app)', '(drawer)', '(pos)'];
		const { result } = renderHook(() => useCameraScan());
		offerRepeatedly(result.current.onScan, 'CAMERA-CODE-1');
		expect(mockEmit).toHaveBeenCalledTimes(1);
		expect(mockEmit.mock.calls[0][0]).toMatchObject({
			code: 'CAMERA-CODE-1',
			source: { kind: 'camera' },
		});
	});

	it('drops decodes from a backgrounded POS tree while another section is focused', () => {
		mockSegments = ['(app)', '(drawer)', 'products'];
		const { result } = renderHook(() => useCameraScan());
		offerRepeatedly(result.current.onScan, 'CAMERA-CODE-2');
		expect(mockEmit).not.toHaveBeenCalled();
	});
});
