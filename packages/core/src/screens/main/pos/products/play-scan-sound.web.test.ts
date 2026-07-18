/**
 * @jest-environment jsdom
 */

interface RecordedOscillator {
	type: string;
	frequency: { value: number };
}

const oscillators: RecordedOscillator[] = [];

class FakeGain {
	gain = { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() };
	connect = jest.fn();
}

class FakeOscillator {
	type = 'sine';
	frequency = { value: 0 };
	// oscillator.connect(gain) must return the gain node so `.connect(dest)` chains.
	connect = jest.fn((node: unknown) => node);
	start = jest.fn();
	stop = jest.fn();
}

class FakeAudioContext {
	currentTime = 0;
	state = 'running';
	destination = {};
	resume = jest.fn(async () => undefined);
	createGain = jest.fn(() => new FakeGain());
	createOscillator = jest.fn(() => {
		const oscillator = new FakeOscillator();
		oscillators.push(oscillator);
		return oscillator;
	});
}

let playScanSuccess: () => void;
let playScanFailure: () => void;

beforeAll(() => {
	(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
	// Require after the global is installed so the module's lazy context uses it.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mod = require('./play-scan-sound.web');
	playScanSuccess = mod.playScanSuccess;
	playScanFailure = mod.playScanFailure;
});

beforeEach(() => {
	oscillators.length = 0;
});

describe('web scan sounds', () => {
	it('success plays a rising two-note blip', () => {
		playScanSuccess();
		expect(oscillators.map((o) => o.frequency.value)).toEqual([880, 1320]);
	});

	it('failure plays a descending square-wave buzz', () => {
		playScanFailure();
		expect(oscillators.map((o) => o.frequency.value)).toEqual([330, 220]);
		expect(oscillators.every((o) => o.type === 'square')).toBe(true);
	});
});
