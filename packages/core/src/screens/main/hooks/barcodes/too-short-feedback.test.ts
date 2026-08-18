const mockToastShow = jest.fn();
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn() }),
}));

// eslint-disable-next-line import/first -- jest.mock() must be registered before this import
import {
	HEURISTIC_TOO_SHORT_WARN_INTERVAL_MS,
	isScanShapedBurst,
	resetHeuristicTooShortRateLimit,
	showHeuristicTooShortFeedback,
	showTooShortFeedback,
} from './too-short-feedback';

const t = (key: string) => key;

beforeEach(() => {
	jest.clearAllMocks();
	resetHeuristicTooShortRateLimit();
});

describe('isScanShapedBurst', () => {
	it('a terminated burst is scan-shaped regardless of content', () => {
		expect(isScanShapedBurst('sdafs', true)).toBe(true);
	});

	it('an all-digit burst is scan-shaped without a terminator', () => {
		expect(isScanShapedBurst('4006', false)).toBe(true);
	});

	it('fast-typed letters without a terminator are not scan-shaped', () => {
		expect(isScanShapedBurst('sdafs', false)).toBe(false);
	});
});

describe('showHeuristicTooShortFeedback', () => {
	it('never toasts for a typing-shaped burst', () => {
		showHeuristicTooShortFeedback(t, 'sdafs', 8, { terminated: false });
		expect(mockToastShow).not.toHaveBeenCalled();
	});

	it('toasts for a terminated burst', () => {
		showHeuristicTooShortFeedback(t, 'sdaf', 8, { terminated: true });
		expect(mockToastShow).toHaveBeenCalledTimes(1);
	});

	it('rate limits scan-shaped toasts to one per interval', () => {
		let clock = 0;
		const now = () => clock;
		showHeuristicTooShortFeedback(t, '4006', 8, { terminated: true, now });
		clock += HEURISTIC_TOO_SHORT_WARN_INTERVAL_MS - 1;
		showHeuristicTooShortFeedback(t, '4006', 8, { terminated: true, now });
		expect(mockToastShow).toHaveBeenCalledTimes(1);
		clock += 1;
		showHeuristicTooShortFeedback(t, '4006', 8, { terminated: true, now });
		expect(mockToastShow).toHaveBeenCalledTimes(2);
	});

	it('a suppressed typing burst does not consume the rate-limit window', () => {
		let clock = 0;
		const now = () => clock;
		showHeuristicTooShortFeedback(t, 'sdafs', 8, { terminated: false, now });
		showHeuristicTooShortFeedback(t, '4006', 8, { terminated: false, now });
		expect(mockToastShow).toHaveBeenCalledTimes(1);
	});
});

describe('showTooShortFeedback (direct sources)', () => {
	it('always toasts — direct-source input is a scan by construction', () => {
		showTooShortFeedback(t, 'ab', 8);
		showTooShortFeedback(t, 'ab', 8);
		expect(mockToastShow).toHaveBeenCalledTimes(2);
	});
});
