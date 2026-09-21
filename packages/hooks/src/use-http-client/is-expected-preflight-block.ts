import { PREFLIGHT_BLOCK } from './request-state-manager';

export const isExpectedPreflightBlock = (error: unknown): boolean =>
	error !== null &&
	typeof error === 'object' &&
	(('isSleeping' in error && error.isSleeping === true) ||
		('blockCode' in error && error.blockCode === PREFLIGHT_BLOCK.OFFLINE));
