import { expect, test } from '@playwright/test';

import { finalizeCreatedOrders } from './order-cleanup';
import { trashOrdersAsWriter } from './search-probe';

import type { APIRequestContext } from '@playwright/test';

const STORE = 'https://store.test';
const writer = { transport: 'header', value: 'x' } as const;
const auth = { headers: { Authorization: 'x' }, params: {} };
type Options = Parameters<APIRequestContext['post']>[1];

function fakeRequest(replies: ({ code: number; body: unknown } | Error)[]) {
	const calls: { url: string; options: Options }[] = [];
	const send = async (url: string, options: Options) => {
		calls.push({ url, options });
		const reply = replies.shift()!;
		if (reply instanceof Error) throw reply;
		return { ok: () => reply.code === 200, status: () => reply.code, json: async () => reply.body };
	};
	return { calls, request: { get: send, post: send } as unknown as APIRequestContext };
}

const cancelReplies = () => [
	{
		code: 200,
		body: [
			{ id: 1, status: 'pos-open' },
			{ id: 2, status: 'completed' },
			{ id: 3, status: 'pos-partial' },
		],
	},
	{
		code: 200,
		body: {
			update: [
				{ id: 1, status: 'cancelled' },
				{ id: 3, status: 'pos-open' },
			],
		},
	},
];

test('trashOrdersAsWriter sends a DELETE without force for each id and counts trash replies', async () => {
	const { request, calls } = fakeRequest(
		[11, 12].map((id) => ({ code: 200, body: { id, status: 'trash' } }))
	);
	expect(await trashOrdersAsWriter(request, STORE, [11, 12], writer)).toEqual({
		trashed: 2,
		failed: 0,
		skipped: 0,
	});
	expect(calls).toHaveLength(2);
	for (const [index, call] of calls.entries()) {
		expect(call.url.endsWith(`/wc/v3/orders/${[11, 12][index]}`)).toBe(true);
		expect(call.options?.params).toMatchObject({ _method: 'DELETE' });
		expect(call.options?.params).not.toHaveProperty('force');
	}
});

test('trashOrdersAsWriter counts a refused or non-trash reply as failed and never throws', async () => {
	const { request } = fakeRequest([
		{ code: 403, body: {} },
		{ code: 200, body: { status: 'cancelled' } },
		new Error('request failed'),
	]);
	await expect(trashOrdersAsWriter(request, STORE, [11, 12, 13], writer)).resolves.toEqual({
		trashed: 0,
		failed: 3,
		skipped: 0,
	});
});

test('trashOrdersAsWriter with a null writer sends nothing', async () => {
	const { request, calls } = fakeRequest([]);
	expect(await trashOrdersAsWriter(request, STORE, [11, 12], null)).toEqual({
		trashed: 0,
		failed: 0,
		skipped: 2,
	});
	expect(calls).toEqual([]);
});

test('finalizeCreatedOrders hands only the ids it cancelled to trash', async () => {
	const { request } = fakeRequest(cancelReplies());
	const trashed: number[][] = [];
	await finalizeCreatedOrders(request, STORE, [1, 2, 3], auth, {
		trash: async (ids) => {
			trashed.push(ids);
		},
	});
	expect(trashed).toEqual([[1]]);
});

test('finalizeCreatedOrders swallows a throwing trash', async () => {
	const { request } = fakeRequest(cancelReplies());
	await expect(
		finalizeCreatedOrders(request, STORE, [1, 2, 3], auth, {
			trash: async () => {
				throw new Error('trash failed');
			},
		})
	).resolves.toMatchObject({ cancelled: 1 });
});
