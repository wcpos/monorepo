/**
 * @jest-environment jsdom
 *
 * Sound/vibration combination contract for scan feedback (#1278 review):
 * the failure tone and the failure vibration are independent toggles.
 */
import { renderHook } from '@testing-library/react';

const mockPlayScanSuccess = jest.fn();
const mockPlayScanFailure = jest.fn();
const mockPlayScanFailureHaptic = jest.fn();
const mockToastShow = jest.fn();

let soundSettings: Record<string, unknown> = {};

jest.mock('./play-scan-sound', () => ({
	playScanSuccess: (...args: unknown[]) => mockPlayScanSuccess(...args),
	playScanFailure: (...args: unknown[]) => mockPlayScanFailure(...args),
	playScanFailureHaptic: (...args: unknown[]) => mockPlayScanFailureHaptic(...args),
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('observable-hooks', () => ({
	useObservablePickState: (_observable: unknown, getInitial: () => unknown) => getInitial(),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { $: {}, getLatest: () => soundSettings } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

// eslint-disable-next-line import/first -- jest.mock() must be registered before this import
import { useScanFeedback } from './use-scan-feedback';

function feedbackWith(settings: Record<string, unknown>) {
	soundSettings = { barcode_scanning_sound_enabled: true, ...settings };
	const { result } = renderHook(() => useScanFeedback());
	return result.current.begin();
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('useScanFeedback sound combinations', () => {
	it('plays the failure tone with haptic when both are enabled', () => {
		feedbackWith({}).notFound('123');
		expect(mockPlayScanFailure).toHaveBeenCalledWith(expect.objectContaining({ haptic: true }));
		expect(mockPlayScanFailureHaptic).not.toHaveBeenCalled();
	});

	it('failure sound off + vibration on fires the haptic alone', () => {
		feedbackWith({ barcode_scanning_sound_failure_enabled: false }).notFound('123');
		expect(mockPlayScanFailure).not.toHaveBeenCalled();
		expect(mockPlayScanFailureHaptic).toHaveBeenCalledTimes(1);
	});

	it('failure sound on + vibration off plays the tone silently on the haptic side', () => {
		feedbackWith({ barcode_scanning_sound_haptic_enabled: false }).notFound('123');
		expect(mockPlayScanFailure).toHaveBeenCalledWith(expect.objectContaining({ haptic: false }));
		expect(mockPlayScanFailureHaptic).not.toHaveBeenCalled();
	});

	it('both failure feedbacks off produces nothing', () => {
		feedbackWith({
			barcode_scanning_sound_failure_enabled: false,
			barcode_scanning_sound_haptic_enabled: false,
		}).notFound('123');
		expect(mockPlayScanFailure).not.toHaveBeenCalled();
		expect(mockPlayScanFailureHaptic).not.toHaveBeenCalled();
	});

	it('master toggle off silences everything, including vibration', () => {
		soundSettings = { barcode_scanning_sound_enabled: false };
		const { result } = renderHook(() => useScanFeedback());
		const handle = result.current.begin();
		handle.notFound('123');
		handle.added('Product');
		expect(mockPlayScanSuccess).not.toHaveBeenCalled();
		expect(mockPlayScanFailure).not.toHaveBeenCalled();
		expect(mockPlayScanFailureHaptic).not.toHaveBeenCalled();
	});

	it('success sound respects its own toggle', () => {
		feedbackWith({ barcode_scanning_sound_success_enabled: false }).added('Product');
		expect(mockPlayScanSuccess).not.toHaveBeenCalled();
		feedbackWith({}).added('Product');
		expect(mockPlayScanSuccess).toHaveBeenCalledTimes(1);
	});

	it('passes theme and clamped volume through to the tone', () => {
		feedbackWith({
			barcode_scanning_sound_theme: 'checkout',
			barcode_scanning_sound_volume: 5,
		}).added('Product');
		expect(mockPlayScanSuccess).toHaveBeenCalledWith({ theme: 'checkout', volume: 0.4 });
	});
});
