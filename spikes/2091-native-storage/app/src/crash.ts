import { fillWithDefaultSettings, normalizeMangoQuery, prepareQuery } from 'rxdb/plugins/core';
import { closeDatabaseConnection } from 'rxdb-premium/plugins/storage-sqlite';

import { openEngine, type Session } from './engines';
import { fixtures, rng } from './fixtures';
import { score, SEED_COUNT, seedIds } from './ledger';
import { captureLogs } from './logs';

import type { Instance, Job, Send } from './types';
const SEED_BATCH = 1000; // Same two untimed seed writes as 2210.
const REOPEN_BUDGET_MS = 10000,
	REOPEN_RETRY_MS = 50; // Specified open + first-read deadline/retry interval.
type CrashDoc = {
	id: string;
	tx: number;
	payload: ReturnType<typeof fixtures>['products'][number]['payload'];
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
};
type CrashData = Omit<CrashDoc, '_deleted' | '_attachments' | '_rev' | '_meta'>;
const schema = fillWithDefaultSettings<CrashData>({
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 64 },
		tx: { type: 'number', minimum: 0, maximum: 1e9, multipleOf: 1 },
		payload: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'tx', 'payload'],
	indexes: ['tx'],
});
const prepared = prepareQuery(
	schema,
	normalizeMangoQuery<CrashDoc>(schema, { selector: { _deleted: false }, sort: [{ id: 'asc' }] })
);
const pattern = [1, 1, 3, 1, 50, 1, 1, 1000];
export async function writer(args: Job, send: Send) {
	const engine = await openEngine(args.row, args.dir, args.db),
		instance = await engine.create('docs', schema);
	await engine.proveWal();
	const templates = fixtures(SEED_COUNT).products,
		previous = new Map<string, CrashDoc>();
	async function write(tx: number, ids: string[]) {
		const documents = ids.map((id, i) => {
			const old = previous.get(id),
				payload = structuredClone(templates[i % templates.length].payload);
			const doc: CrashDoc = {
				id,
				tx,
				payload,
				_deleted: false,
				_attachments: {},
				_rev: `${Number(old?._rev.split('-')[0] ?? 0) + 1}-${tx}`,
				_meta: { lwt: 1700000000000 + tx + 1 },
			};
			payload.description = '';
			payload.description = 'x'.repeat(Math.max(0, 2000 - JSON.stringify(doc).length));
			return doc;
		});
		const result = await instance.bulkWrite(
			documents.map((document) => ({
				document,
				...(previous.has(document.id) ? { previous: previous.get(document.id) } : {}),
			})),
			'spike2091'
		);
		if (result.error.length) throw new Error(JSON.stringify(result.error));
		for (const doc of documents) previous.set(doc.id, doc);
	}
	await write(0, seedIds.slice(0, SEED_BATCH));
	await write(0, seedIds.slice(SEED_BATCH));
	await engine.analyze(instance);
	await send({ type: 'seeded', ...engine.proofs });
	for (let tx = 1; ; tx++) {
		const n = pattern[(tx - 1) % pattern.length],
			start = Math.floor(rng(2144 + tx)() * SEED_COUNT);
		const ids = Array.from({ length: n }, (_, i) =>
			i < Math.floor(n / 5) ? `s${(start + i) % SEED_COUNT}` : `t${tx}-${i}`
		);
		await send({ type: 'started', tx, n, ids });
		await write(tx, ids);
		await send({ type: 'acked', tx });
	}
}

export async function scorer(args: Job, send: Send) {
	if (!args.snapshot) throw new Error('Missing driver snapshot');
	const capture = captureLogs(() => {
			void send({ type: 'begin-retry' }).catch(() => {});
		}),
		start = performance.now();
	let engine: Session | undefined,
		instance: Instance<CrashData> | undefined,
		docs: CrashDoc[] | undefined;
	let lastError: string | undefined, subscription: { unsubscribe(): void } | undefined;
	await send({ type: 'scoring' });
	try {
		do {
			try {
				engine ??= await openEngine(args.row, args.dir, args.db);
				instance ??= await engine.create('docs', schema);
				subscription ??= instance
					.changeStream()
					.subscribe({ error: (e) => capture.logs.push(`storage error: ${String(e)}`) });
				docs = (await instance.query(prepared)).documents;
				break;
			} catch (error) {
				lastError = String(error);
				subscription?.unsubscribe();
				subscription = undefined;
				await engine?.close().catch(() => {});
				if (engine?.sqliteBasics)
					await Promise.resolve(
						closeDatabaseConnection(engine.databaseName, engine.sqliteBasics)
					).catch(() => {});
				engine = undefined;
				instance = undefined;
				await new Promise((resolve) => setTimeout(resolve, REOPEN_RETRY_MS));
			}
		} while (performance.now() - start < REOPEN_BUDGET_MS);
		const reopenMs = performance.now() - start;
		if (!docs)
			return {
				outcome: 'open-failed',
				reopenMs,
				integrity: 'not checked',
				error: lastError,
				logs: capture.logs,
			};
		await send({ type: 'read' }); // End the reopen deadline before integrity/scoring, as in 2210.
		await engine!.proveWal();
		let integrity: string[];
		if (args.row === 'expo-sqlite') {
			try {
				integrity = (await engine!.proof('PRAGMA integrity_check')).map((r) => Object.values(r)[0]);
			} catch (error) {
				integrity = [String(error)];
			}
		} else {
			integrity = capture.logs.filter(
				(l) =>
					/pars(e|ing).*fail|syntaxerror|corrupt|invalid json|storage error|_decode\(\) failed|failed|error/i.test(
						l
					) && !/rebuilt|salvaged|recovered/i.test(l)
			);
			if (!integrity.length) integrity = ['ok'];
		}
		const repairs = capture.logs.filter((l) => /rebuilt|salvag|recover/i.test(l)).length;
		const ledger = score(args.snapshot, docs);
		const result =
			integrity.length === 1 && integrity[0] === 'ok'
				? ledger
				: { outcome: 'integrity-failed', inflightPresence: ledger.inflightPresence };
		return {
			...result,
			ledger: ledger.outcome,
			missingCount: ledger.missingCount ?? 0,
			repairs,
			reopenMs,
			integrity: integrity.join('; '),
			...engine!.proofs,
			logs: capture.logs,
		};
	} finally {
		subscription?.unsubscribe();
		capture.restore();
	}
	// Do not close/repair the scorer's storage before reporting. The driver stops this process.
}
