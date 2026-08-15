const mockPlay = jest.fn();
const mockSeekTo = jest.fn();
const mockCreateAudioPlayer = jest.fn(() => ({ play: mockPlay, seekTo: mockSeekTo }));
const mockNotificationAsync = jest.fn();

jest.mock('./assets/scan-success.wav', () => 'scan-success-asset', { virtual: true });
jest.mock('./assets/scan-failure.wav', () => 'scan-failure-asset', { virtual: true });
jest.mock('expo-audio', () => ({ createAudioPlayer: mockCreateAudioPlayer }), { virtual: true });
jest.mock(
	'expo-haptics',
	() => ({
		notificationAsync: mockNotificationAsync,
		NotificationFeedbackType: { Error: 'error' },
	}),
	{ virtual: true }
);

// eslint-disable-next-line import/first -- jest.mock() must be registered before this import
import { playScanFailure, playScanSuccess } from './play-scan-sound';

beforeEach(() => {
	jest.clearAllMocks();
});

describe('native scan sounds', () => {
	it('plays the success asset without firing a haptic', () => {
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

	it('never throws when the audio backend is unavailable', () => {
		mockCreateAudioPlayer.mockImplementationOnce(() => {
			throw new Error('no native audio');
		});
		expect(() => playScanSuccess()).not.toThrow();
	});
});
