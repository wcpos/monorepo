import { isChooserCancel } from './chooser-cancel';

describe('isChooserCancel', () => {
	it('treats a closed chooser as a cancel', () => {
		expect(
			isChooserCancel(Object.assign(new Error('No port selected'), { name: 'NotFoundError' }))
		).toBe(true);
		expect(isChooserCancel(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
	});

	it('keeps a real failure a failure', () => {
		expect(isChooserCancel(Object.assign(new Error('busy'), { name: 'NetworkError' }))).toBe(false);
		expect(isChooserCancel(new Error('boom'))).toBe(false);
		expect(isChooserCancel(null)).toBe(false);
	});
});
