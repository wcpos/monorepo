import type { SyncObserver } from './telemetry';

export type CategoryLoggerLike = {
	getChild(name: string): CategoryLoggerLike;
	with(context: Record<string, unknown>): CategoryLoggerLike;
	debug(message: string | (() => string)): void;
	info(message: string, options?: { saveToDb?: boolean; showToast?: boolean }): void;
	warn(message: string, options?: { saveToDb?: boolean; showToast?: boolean }): void;
	error(message: string, options?: { saveToDb?: boolean; showToast?: boolean }): void;
};

/** Adapt the portable telemetry spine to production's CategoryLogger shape. */
export function createCategoryLoggerObserver(root: CategoryLoggerLike): SyncObserver {
	return (event) => {
		const category = event.collection === undefined ? root : root.getChild(event.collection);
		const logger = category.with({ ...event.fields, type: event.type });
		const message = event.message ?? event.type;
		if (event.level === 'debug') {
			logger.debug(() => message);
			return;
		}
		if (event.level === 'warn' || event.level === 'error') {
			logger[event.level](message, { saveToDb: true, showToast: false });
			return;
		}
		logger.info(message);
	};
}
