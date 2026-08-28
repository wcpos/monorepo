export function getResizeTargetMinimumSize() {
	return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
		? 37
		: 27;
}
