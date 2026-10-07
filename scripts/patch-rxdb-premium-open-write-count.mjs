/** rxdb-premium's SQLite `bulkWrite` counts itself into `openWriteCount$` before its transaction
 * and counts itself out only on "already closed" or when its handler returns COMMIT/ROLLBACK. A
 * handler that throws for any other reason (a masked UNIQUE-constraint error, a closed statement)
 * leaves the count high for ever, and `close()` — which waits for the count to reach 0 — hangs.
 * Before `patches/rxdb@17.5.0.patch` kept the transaction queue alive that hang was masked by the
 * queue's own latched rejection (close() threw instead); with the queue recovering, the leak is
 * the only thing left between a failed write and a clean collection close (monorepo#2417).
 * Wraps the handler so a thrown error counts the write out exactly once; the error still propagates.
 * License-materialized dist is patched after postinstall, both variants, idempotently.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const MARKER = '/*WCPOS_OPEN_WRITE_COUNT_PATCH*/';
export const DISTS = ['esm', 'cjs'];

// The handler opens right after `(async()=>{` and closes right before the context argument.
const HEAD =
	/(return await\s*(?:\(0,\w+\.sqliteTransaction\)|\w+)\(\w+,this\.sqliteBasics,)\(async\(\)=>\{(?=if\(this\.closed\)throw this\.openWriteCount\$\.next\(this\.openWriteCount\$\.getValue\(\)-1\),new Error\("SQLite\.bulkWrite\(\) already closed ")/;
export const TAIL =
	'(this.openWriteCount$.next(this.openWriteCount$.getValue()-1),"COMMIT")}),{databaseName:this.databaseName,collectionName:this.collectionName})';
export const HEAD_AFTER = (call) => call + MARKER + '(async()=>{try{return await(async()=>{';
export const TAIL_AFTER =
	'(this.openWriteCount$.next(this.openWriteCount$.getValue()-1),"COMMIT")})()}' +
	// "already closed" counted itself out before throwing; everything else has not.
	'catch(e){if(!(e&&e.message&&String(e.message).includes("already closed")))this.openWriteCount$.next(this.openWriteCount$.getValue()-1);throw e}}),' +
	'{databaseName:this.databaseName,collectionName:this.collectionName})';

export function preparePatch(path) {
	const source = readFileSync(path, 'utf8');
	const count = (anchor) => source.split(anchor).length - 1;
	if (source.includes(MARKER)) {
		if (count(MARKER) !== 1 || count(TAIL_AFTER) !== 1)
			throw new Error(`${path}: patched, but the anchors no longer match — re-derive the patch`);
		return { path, status: 'already patched' };
	}
	const head = source.match(HEAD);
	if (!head || count(TAIL) !== 1)
		throw new Error(
			`anchor missing in ${path} (head: ${head ? 'found' : 'missing'}, tail: ${count(TAIL)}) — rxdb-premium changed; re-derive the open-write-count patch`
		);
	return {
		path,
		status: 'patched',
		next: source.replace(HEAD, (_m, call) => HEAD_AFTER(call)).replace(TAIL, () => TAIL_AFTER),
	};
}

export function patchDists(packageRoot) {
	const prepared = DISTS.map((dist) =>
		preparePatch(
			join(packageRoot, `dist/${dist}/plugins/storage-sqlite/sqlite-storage-instance.js`)
		)
	);
	for (const { path, next } of prepared) if (next !== undefined) writeFileSync(path, next);
	return prepared;
}

if (
	process.argv[1] &&
	realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
	const results = patchDists(dirname(require.resolve('rxdb-premium/package.json')));
	console.log(
		`[patch-rxdb-premium-open-write-count] ${results.map(({ status }, index) => `${DISTS[index]}: ${status}`).join(', ')}`
	);
}
