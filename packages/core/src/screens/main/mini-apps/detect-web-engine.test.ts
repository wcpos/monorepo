/** @jest-environment jsdom */
import { detectWebEngine } from './detect-web-engine';

describe('detectWebEngine', () => {
	it.each([
		['Mozilla/5.0 Firefox/142.0', 'gecko'],
		['Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15', 'webkit'],
		['Mozilla/5.0 AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36', 'chromium'],
	] as const)('detects %s as %s', (userAgent, engine) => {
		expect(detectWebEngine(userAgent)).toBe(engine);
	});
});
