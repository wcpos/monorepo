const mockPlay = jest.fn();
const mockSeekTo = jest.fn();
const createdPlayers: { play: jest.Mock; seekTo: jest.Mock; volume: number }[] = [];
const mockCreateAudioPlayer = jest.fn(() => {
	const player = { play: mockPlay, seekTo: mockSeekTo, volume: 1 };
	createdPlayers.push(player);
	return player;
});
const mockNotificationAsync = jest.fn();

jest.mock('./assets/scan-success.wav', () => 'scan-success-asset', { virtual: true });
jest.mock('./assets/scan-failure.wav', () => 'scan-failure-asset', { virtual: true });
jest.mock('./assets/scan-success-checkout.wav', () => 'scan-success-checkout-asset', {
	virtual: true,
});
jest.mock('./assets/scan-failure-checkout.wav', () => 'scan-failure-checkout-asset', {
	virtual: true,
});
jest.mock('./assets/scan-success-soft.wav', () => 'scan-success-soft-asset', { virtual: true });
jest.mock('./assets/scan-failure-soft.wav', () => 'scan-failure-soft-asset', { virtual: true });
jest.mock('expo-audio', () => ({ createAudioPlayer: mockCreateAudioPlayer }), { virtual: true });
jest.mock(
	'expo-haptics',
	() => ({
		notificationAsync: mockNotificationAsync,
		NotificationFeedbackType: { Error: 'error' },
	}),
	{ virtual: true }
);

type PlayModule = typeof import('./play-scan-sound');
let playScanSuccess: PlayModule['playScanSuccess'];
let playScanFailure: PlayModule['playScanFailure'];

beforeEach(() => {
	jest.clearAllMocks();
	createdPlayers.length = 0;
	// The module caches one player per theme+kind; a fresh module per test keeps
	// the createAudioPlayer assertions deterministic.
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require('./play-scan-sound') as PlayModule;
		playScanSuccess = mod.playScanSuccess;
		playScanFailure = mod.playScanFailure;
	});
});

describe('native scan sounds', () => {
	it('plays the classic success asset by default without firing a haptic', () => {
		playScanSuccess();
		expect(mockCreateAudioPlayer).toHaveBeenCalledWith('scan-success-asset');
		expect(mockSeekTo).toHaveBeenCalledWith(0);
		expect(mockPlay).toHaveBeenCalledTimes(1);
		expect(mockNotificationAsync).not.toHaveBeenCalled();
	});

	it('plays the failure asset and fires an error haptic', () => {
		playScanFailure();
		expect(mockCreateAudioPlayer).toHaveBeenCalledWith('scan-failure-asset');
		expect(mockPlay).toHaveBeenCalledTimes(1);
		expect(mockNotificationAsync).toHaveBeenCalledWith('error');
	});

	it('selects the asset pair for the requested theme', () => {
		playScanSuccess({ theme: 'checkout' });
		expect(mockCreateAudioPlayer).toHaveBeenCalledWith('scan-success-checkout-asset');
		playScanFailure({ theme: 'soft' });
		expect(mockCreateAudioPlayer).toHaveBeenCalledWith('scan-failure-soft-asset');
	});

	it('falls back to classic for an unknown theme', () => {
		playScanSuccess({ theme: 'polka' as never });
		expect(mockCreateAudioPlayer).toHaveBeenCalledWith('scan-success-asset');
	});

	it('applies the clamped volume to the player at play time', () => {
		playScanSuccess({ volume: 0.3 });
		expect(createdPlayers[0].volume).toBe(0.3);
		// Out-of-range volumes clamp instead of blasting or muting.
		playScanSuccess({ volume: 5 });
		expect(createdPlayers[0].volume).toBe(0.4);
	});

	it('haptic: false suppresses the error haptic but still plays the tone', () => {
		playScanFailure({ haptic: false });
		expect(mockPlay).toHaveBeenCalledTimes(1);
		expect(mockNotificationAsync).not.toHaveBeenCalled();
	});

	it('never throws when the audio backend is unavailable', () => {
		mockCreateAudioPlayer.mockImplementationOnce(() => {
			throw new Error('no native audio');
		});
		expect(() => playScanSuccess()).not.toThrow();
	});
});
