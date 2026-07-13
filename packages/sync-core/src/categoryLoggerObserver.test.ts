import { describe, expect, it } from 'vitest';

import { type CategoryLoggerLike, createCategoryLoggerObserver } from './categoryLoggerObserver';

function fakeLogger() {
	const calls: {
		category: string;
		context: Record<string, unknown>;
		level: string;
		message: unknown;
		options?: unknown;
	}[] = [];
	const make = (category = 'root', context: Record<string, unknown> = {}): CategoryLoggerLike => ({
		getChild: (name) => make(name, context),
		with: (next) => make(category, next),
		debug: (message) => calls.push({ category, context, level: 'debug', message }),
		info: (message, options) => calls.push({ category, context, level: 'info', message, options }),
		warn: (message, options) => calls.push({ category, context, level: 'warn', message, options }),
		error: (message, options) =>
			calls.push({ category, context, level: 'error', message, options }),
	});
	return { root: make(), calls };
}

describe('createCategoryLoggerObserver', () => {
	it('routes collections, preserves the canonical type, and maps every level', () => {
		const { root, calls } = fakeLogger();
		const observe = createCategoryLoggerObserver(root);
		observe({
			type: 'pull.batch',
			level: 'debug',
			collection: 'orders',
			message: 'pulled',
			fields: { type: 'spoofed', count: 2 },
		});
		observe({ type: 'engine.ready', level: 'info' });
		observe({ type: 'queue.claim-lost', level: 'warn', message: 'lost' });
		observe({ type: 'engine.failed', level: 'error', message: 'failed' });

		expect(calls.map(({ category, level, options }) => ({ category, level, options }))).toEqual([
			{ category: 'orders', level: 'debug', options: undefined },
			{ category: 'root', level: 'info', options: undefined },
			{ category: 'root', level: 'warn', options: { saveToDb: true, showToast: false } },
			{ category: 'root', level: 'error', options: { saveToDb: true, showToast: false } },
		]);
		expect(calls[0]?.context).toEqual({ type: 'pull.batch', count: 2 });
		expect(typeof calls[0]?.message).toBe('function');
	});

	it('passes debug text lazily and unevaluated', () => {
		const { root, calls } = fakeLogger();
		createCategoryLoggerObserver(root)({
			type: 'pull.batch',
			level: 'debug',
			message: 'debug text',
		});
		const lazy = calls[0]?.message as () => string;
		expect(typeof lazy).toBe('function');
		expect(lazy()).toBe('debug text');
	});
});
