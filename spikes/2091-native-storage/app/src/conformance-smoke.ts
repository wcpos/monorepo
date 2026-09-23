import {
	fillWithDefaultSettings,
	now,
	prepareQuery,
	type RxDocumentData,
	type RxStorageInstance,
	stripAttachmentsDataFromDocument,
} from 'rxdb/plugins/core';
import * as schemas from 'rxdb/plugins/test-utils';

import type { Session } from './engines';

type Human = { passportId: string; firstName: string; lastName: string; age?: number };
type Document = RxDocumentData<Human>;
export type ConformanceResult = { name: string; pass: boolean; detail: string };

const schema = fillWithDefaultSettings({
	...schemas.human,
	attachments: {},
} as typeof schemas.human);

function document(
	passportId: string,
	firstName: string,
	lastName: string,
	revision: string
): Document {
	return {
		passportId,
		firstName,
		lastName,
		age: 30,
		_attachments: {},
		_deleted: false,
		_meta: { lwt: now() },
		_rev: revision,
	};
}

function check(value: unknown, detail: string): asserts value {
	if (!value) throw new Error(detail);
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
	if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(blob);
	});
}

export async function runConformanceSmoke(
	session: Session,
	onResult?: (result: ConformanceResult) => void
) {
	const open = () => session.create<Human>('humans', schema);
	const results: ConformanceResult[] = [];
	const scenario = async (name: string, test: () => Promise<string>) => {
		try {
			const result = { name, pass: true, detail: await test() };
			results.push(result);
			onResult?.(result);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const result = { name, pass: false, detail };
			console.error(`CONFORMANCE ${name} FAIL ${detail}`);
			results.push(result);
			onResult?.(result);
		}
	};

	let instance: Awaited<ReturnType<typeof open>>;
	try {
		instance = await open();
		await session.proveWal();
	} catch (error) {
		const result = { name: 'initialization', pass: false, detail: String(error) };
		console.error(`CONFORMANCE initialization FAIL ${result.detail}`);
		results.push(result);
		onResult?.(result);
		return results;
	}
	const changes: { events: { operation: string }[]; checkpoint: { id: string; lwt: number } }[] =
		[];
	const subscription = instance
		.changeStream()
		.subscribe((event) => changes.push(event as (typeof changes)[number]));
	let inserted!: Document;
	let updated!: Document;
	let deleted!: Document;
	let alpha!: Document;
	let zulu!: Document;

	await scenario('bulk-write', async () => {
		inserted = document('deleted', 'Deleted', 'Record', '1-insert');
		check(
			!(await instance.bulkWrite([{ document: inserted }], 'smoke-insert')).error.length,
			'insert failed'
		);
		const mismatch = { ...inserted, _rev: '1-mismatch' };
		const conflict = await instance.bulkWrite(
			[{ previous: mismatch, document: { ...inserted, _rev: '2-conflict' } }],
			'smoke-conflict'
		);
		check(conflict.error[0]?.status === 409, '_rev mismatch was not reported as a 409 conflict');
		updated = { ...inserted, firstName: 'Updated', _rev: '2-update', _meta: { lwt: now() } };
		check(
			!(await instance.bulkWrite([{ previous: inserted, document: updated }], 'smoke-update')).error
				.length,
			'update failed'
		);
		deleted = { ...updated, _deleted: true, _rev: '3-delete', _meta: { lwt: now() } };
		check(
			!(await instance.bulkWrite([{ previous: updated, document: deleted }], 'smoke-delete')).error
				.length,
			'delete failed'
		);
		return 'insert/update/delete and conflict 409';
	});

	await scenario('query-sort', async () => {
		alpha = document('alpha', 'Charlie', 'Alpha', '1-alpha');
		zulu = document('zulu', 'Alice', 'Zulu', '1-zulu');
		check(
			!(await instance.bulkWrite([{ document: alpha }, { document: zulu }], 'smoke-seed')).error
				.length,
			'query seed failed'
		);
		const selector = { _deleted: { $eq: false } };
		const indexed = await instance.query(
			prepareQuery(schema, { selector, sort: [{ firstName: 'asc' }], skip: 0 })
		);
		const unindexed = await instance.query(
			prepareQuery(schema, { selector, sort: [{ lastName: 'asc' }], skip: 0 })
		);
		const indexedIds = indexed.documents.map((item) => item.passportId).join();
		const unindexedIds = unindexed.documents.map((item) => item.passportId).join();
		check(indexedIds === 'zulu,alpha', `indexed sort order was ${indexedIds}`);
		check(unindexedIds === 'alpha,zulu', `non-index sort order was ${unindexedIds}`);
		return 'indexed and non-indexed sort';
	});

	await scenario('count', async () => {
		const result = await instance.count(
			prepareQuery(schema, {
				selector: { _deleted: { $eq: false } },
				sort: [{ passportId: 'asc' }],
				skip: 0,
			})
		);
		check(result.count === 2, `expected 2 active documents, got ${result.count}`);
		return '2 active documents';
	});

	await scenario('find-by-id', async () => {
		const active = await instance.findDocumentsById(['deleted', 'alpha'], false);
		const withDeleted = await instance.findDocumentsById(['deleted', 'alpha'], true);
		check(
			active.length === 1 && active[0].passportId === 'alpha',
			'without-deleted result was wrong'
		);
		check(
			withDeleted.length === 2 && withDeleted.some((item) => item._deleted),
			'with-deleted result was wrong'
		);
		return 'with and without deleted';
	});

	await scenario('change-stream', async () => {
		const events = changes.slice(0, 3);
		check(
			events.flatMap((bulk) => bulk.events.map((event) => event.operation)).join() ===
				'INSERT,UPDATE,DELETE',
			'event ordering was wrong'
		);
		check(
			events[2]?.checkpoint?.id === 'deleted' && events[2].checkpoint.lwt === deleted._meta.lwt,
			'final checkpoint was wrong'
		);
		return 'INSERT → UPDATE → DELETE with checkpoint';
	});

	await scenario('attachments', async () => {
		const pattern = [0x00, 0x80, 0xff, 0xe2, 0x82, 0xac]; // arbitrary bytes and UTF-8 €
		const bytes = Uint8Array.from(
			{ length: 32 * 1024 },
			(_, index) => pattern[index % pattern.length]
		);
		const blob = new Blob([bytes], { type: 'application/octet-stream' });
		// Precomputed SHA-256 of this fixture: keep the smoke about storage, not native crypto.
		const digest = 'e8884cd90dc617d3e07f2af74fdd77852a19a85fc751b8bdc90647111c102f1c';
		const withAttachment = {
			...alpha,
			_rev: '2-alpha',
			_meta: { lwt: now() },
			_attachments: { blob: { data: blob, digest, length: blob.size, type: blob.type } },
		};
		check(
			!(
				await instance.bulkWrite(
					[{ previous: alpha, document: withAttachment }],
					'smoke-attachment-write'
				)
			).error.length,
			'attachment write failed'
		);
		const read = await instance.getAttachmentData('alpha', 'blob', digest);
		const readBytes = new Uint8Array(await readBlob(read));
		// RxDB permits storage blobs without MIME type; it persists type in the document metadata.
		const [stored] = await instance.findDocumentsById(['alpha'], false);
		check(stored?._attachments.blob?.type === blob.type, 'attachment type differed');
		check(
			readBytes.length === bytes.length && readBytes.every((byte, index) => byte === bytes[index]),
			'32 KB binary attachment content differed'
		);
		const withoutAttachment = {
			...withAttachment,
			_rev: '3-alpha',
			_meta: { lwt: now() },
			_attachments: {},
		};
		check(
			!(
				await instance.bulkWrite(
					[
						{
							previous: await stripAttachmentsDataFromDocument(withAttachment),
							document: withoutAttachment,
						},
					],
					'smoke-attachment-remove'
				)
			).error.length,
			'attachment remove failed'
		);
		let removed = false;
		try {
			await instance.getAttachmentData('alpha', 'blob', digest);
		} catch {
			removed = true;
		}
		check(removed, 'removed attachment was still readable');
		alpha = withoutAttachment;
		return '32 KB write/read/remove';
	});

	await scenario('cleanup', async () => {
		await instance.cleanup(0);
		check(
			!(await instance.findDocumentsById(['deleted'], true)).length,
			'deleted document survived cleanup'
		);
		return 'deleted document removed';
	});

	await scenario('close-reopen', async () => {
		subscription.unsubscribe();
		await instance.close();
		instance = await open();
		const persisted = await instance.findDocumentsById(['alpha', 'zulu'], false);
		check(persisted.length === 2, `expected 2 persisted documents, got ${persisted.length}`);
		return '2 documents persisted';
	});

	try {
		await instance.remove();
	} catch {
		await instance.close();
	}
	return results;
}
