import * as query from '../src';

// Named map: eslint's import/namespace cannot validate a computed `commands[name]`.
const commands = {
	markNotificationRead: query.markNotificationRead,
	markAllNotificationsRead: query.markAllNotificationsRead,
	markAllNotificationsSeen: query.markAllNotificationsSeen,
	upsertNotification: query.upsertNotification,
} as const;

const row = {
	id: 'notification-1',
	subscriberId: 'subscriber-1',
	title: 'Welcome',
	body: 'Hello',
	status: 'unread' as const,
	seen: false,
	createdAt: 1,
	workflowId: null,
	channel: 'in_app',
};

function fixture(initial: query.NotificationRow[] = [row]) {
	const stored = new Map(initial.map((item) => [item.id, { ...item }]));
	const document = (id: string) => ({
		getLatest() {
			return this;
		},
		patch: async (patch: Partial<query.NotificationRow>) => {
			stored.set(id, { ...stored.get(id)!, ...patch });
		},
		incrementalModify: async (
			modify: (current: query.NotificationRow) => query.NotificationRow
		) => {
			stored.set(id, modify(stored.get(id)!));
		},
	});
	const collection = {
		schema: { primaryPath: 'id' },
		findOne: jest.fn((id: string) => ({
			exec: async () => (stored.has(id) ? document(id) : null),
		})),
		find: jest.fn(({ selector }: { selector: Partial<query.NotificationRow> }) => ({
			exec: async () =>
				[...stored.values()]
					.filter((item) =>
						Object.entries(selector).every(
							([key, value]) => item[key as keyof typeof item] === value
						)
					)
					.map((item) => document(item.id)),
		})),
		insert: jest.fn(async (next: query.NotificationRow) => {
			stored.set(next.id, next);
		}),
	};
	return { stored, collection, database: { collections: { notifications: collection } } };
}

// A missing database must reject, never silently discard a write.
it.each([
	'markNotificationRead',
	'markAllNotificationsRead',
	'markAllNotificationsSeen',
	'upsertNotification',
] as const)('%s rejects an absent database', async (name) => {
	for (const database of [null, undefined]) {
		const result =
			name === 'upsertNotification'
				? commands[name](database, row, { preserveLocalState: false })
				: commands[name](database, row.id);
		await expect(result).rejects.toBeInstanceOf(query.StoreDatabaseUnavailableError);
	}
});

it('marks only the requested row and returns false for a missing id', async () => {
	const { stored, database } = fixture([row, { ...row, id: 'other' }]);
	await expect(query.markNotificationRead(database, row.id)).resolves.toBe(true);
	expect(stored.get(row.id)).toMatchObject({ status: 'read', seen: true });
	expect(stored.get('other')).toEqual({ ...row, id: 'other' });
	await expect(query.markNotificationRead(database, 'missing')).resolves.toBe(false);
	const replacement = fixture();
	database.collections.notifications = replacement.collection;
	await query.markNotificationRead(database, row.id);
	expect(replacement.stored.get(row.id)?.seen).toBe(true);
});

// Wrong selectors would mutate a different subscriber or archived/already-seen rows.
it.each([
	['markAllNotificationsRead', { status: 'unread' }, { status: 'read', seen: true }],
	['markAllNotificationsSeen', { seen: false }, { status: 'unread', seen: true }],
] as const)('%s scopes writes and returns the affected count', async (name, selector, expected) => {
	const untouched = [
		{ ...row, id: 'foreign', subscriberId: 'other' },
		{ ...row, id: 'archived', status: 'archived' as const, seen: true },
	];
	const { database, stored, collection } = fixture([row, { ...row, id: 'second' }, ...untouched]);
	await expect(commands[name](database, row.subscriberId)).resolves.toBe(2);
	expect(collection.find).toHaveBeenCalledWith({
		selector: { subscriberId: row.subscriberId, ...selector },
	});
	for (const id of [row.id, 'second']) expect(stored.get(id)).toMatchObject(expected);
	for (const item of untouched) expect(stored.get(item.id)).toEqual(item);
	await expect(commands[name](database, row.subscriberId)).resolves.toBe(0);
});

it('overwrites local state with the full row when not preserving it', async () => {
	const { database, stored } = fixture([{ ...row, status: 'read', seen: true }]);
	await query.upsertNotification(database, row, { preserveLocalState: false });
	expect(stored.get(row.id)).toEqual(row);
});

it.each(['read', 'archived'] as const)(
	'does not overwrite newer local %s state with an older snapshot',
	async (status) => {
		const { database, stored } = fixture([{ ...row, status, seen: true }]);
		await query.upsertNotification(
			database,
			{ ...row, title: 'Updated' },
			{ preserveLocalState: true }
		);
		expect(stored.get(row.id)).toEqual({ ...row, title: 'Updated', status, seen: true });
	}
);

it('accepts server read/seen state when the local row is unread/unseen', async () => {
	const { database, stored } = fixture();
	await query.upsertNotification(
		database,
		{ ...row, status: 'read', seen: true },
		{ preserveLocalState: true }
	);
	expect(stored.get(row.id)).toMatchObject({ status: 'read', seen: true });
});

it('inserts missing snapshot rows', async () => {
	const { database, stored, collection } = fixture([]);
	await query.upsertNotification(database, row, { preserveLocalState: true });
	expect(stored.get(row.id)).toEqual(row);
	expect(collection.insert).toHaveBeenCalledWith(row);
});

it('merges into a row a concurrent insert created, keeping its local read state', async () => {
	const { database, stored, collection } = fixture([]);
	collection.insert.mockImplementationOnce(async () => {
		stored.set(row.id, { ...row, status: 'read', seen: true });
		throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
	});
	await query.upsertNotification(
		database,
		{ ...row, title: 'Updated' },
		{ preserveLocalState: true }
	);
	expect(stored.get(row.id)).toEqual({ ...row, title: 'Updated', status: 'read', seen: true });
});

it('rejects an insert failure that is not a conflict', async () => {
	const { database, collection } = fixture([]);
	collection.insert.mockRejectedValueOnce(new Error('disk full'));
	await expect(
		query.upsertNotification(database, row, { preserveLocalState: true })
	).rejects.toThrow('disk full');
});
