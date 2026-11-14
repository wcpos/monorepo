import { classifyResolutionError } from './resolution-error';

describe('classifyResolutionError', () => {
	it('recognises a change that is already resolved', () => {
		expect(
			classifyResolutionError(new Error('resolveConflict: terminal mutation "m-1" not found'))
		).toBe('already-resolved');
	});

	it('recognises a claim another window holds', () => {
		expect(
			classifyResolutionError(
				new Error('resolveConflict: another window is resolving "m-1" right now — try again')
			)
		).toBe('held-elsewhere');
	});

	it('keeps anything else a real failure', () => {
		expect(classifyResolutionError(new Error('storage fault'))).toBe('failed');
	});
});
