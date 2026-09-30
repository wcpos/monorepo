/**
 * Child process for `rxdb-rollback.test.ts` (#2292): runs ANOTHER rxdb / rxdb-premium install.
 *   node rollback-reader.cjs <otherPackageJson> <kind> <dir> <schemas.json> <expected.json> [read|write]
 * read (default): reopen the test's database, check every expected row, run the indexed find,
 * claim one queue row (patch) and ack another (bulkRemove). write: create it with the expected
 * rows. Schemas come only from schemas.json. Prints one JSON line
 * `{ ok, rxdbVersion, rows, problems }` and exits 1 on any problem.
 */
'use strict';
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const [otherPackageJson, kind, dir, schemasPath, expectedPath, mode = 'read'] =
	process.argv.slice(2);
const other = createRequire(otherPackageJson);
const rxdb = other('rxdb');
const schemas = JSON.parse(readFileSync(schemasPath, 'utf8'));
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
const NAMES = ['orders', 'recordMutations'];

function storage() {
	if (kind === 'filesystem-node') {
		const { getRxStorageFilesystemNode } = other('rxdb-premium/plugins/storage-filesystem-node');
		return getRxStorageFilesystemNode({ basePath: dir });
	}
	if (kind !== 'sqlite') throw new Error(`unknown storage ${kind}`);
	const plugin = other('rxdb-premium/plugins/storage-sqlite');
	const basics = plugin.getSQLiteBasicsNodeNative(DatabaseSync);
	const open = basics.open;
	basics.open = async (name) => open(join(dir, `${name}.sqlite`));
	return plugin.getRxStorageSQLite({ sqliteBasics: basics });
}

async function openDatabase() {
	const options = { name: schemas.databaseName, storage: storage(), multiInstance: false };
	const db = await rxdb.createRxDatabase(options);
	// Stored rows are already at the schema's version, so no strategy runs; rxdb only
	// requires one to be declared per version.
	const strategies = Object.fromEntries(schemas.queueMigrations.map((v) => [v, (doc) => doc]));
	await db.addCollections({
		orders: { schema: schemas.orders },
		recordMutations: { schema: schemas.recordMutations, migrationStrategies: strategies },
	});
	return db;
}

async function verifyAndWrite(db, problems, rows) {
	for (const name of NAMES) {
		// toJSON() drops rxdb's own _meta / _rev / _deleted; both sides are in primary-key order.
		const found = (await db.collections[name].find().exec()).map((doc) => doc.toJSON());
		rows[name] = found.length;
		if (!isDeepStrictEqual(found, expected[name]))
			problems.push(`${name} differ: ${JSON.stringify(found)}`);
	}
	const byStatus = (await db.orders.find(expected.query.find).exec()).map((doc) => doc.uuid);
	if (!isDeepStrictEqual(byStatus, expected.query.uuids))
		problems.push(`indexed find by status: ${JSON.stringify(byStatus)}`);
	const claimed = await db.recordMutations.findOne(expected.claim.id).exec();
	if (!claimed) problems.push(`claim row ${expected.claim.id} missing`);
	else await claimed.patch(expected.claim.patch);
	const acked = await db.recordMutations.bulkRemove([expected.ack]);
	if (acked.error.length) problems.push(`ack failed: ${JSON.stringify(acked.error)}`);
}

async function main() {
	const report = { ok: false, rxdbVersion: rxdb.RXDB_VERSION, rows: {}, problems: [] };
	try {
		if (mode !== 'read' && mode !== 'write') throw new Error(`unknown mode ${mode}`);
		rxdb.addRxPlugin(other('rxdb/plugins/migration-schema').RxDBMigrationSchemaPlugin);
		other('rxdb-premium/plugins/shared').setPremiumFlag();
		const db = await openDatabase();
		try {
			if (mode === 'read') await verifyAndWrite(db, report.problems, report.rows);
			else
				for (const name of NAMES) {
					for (const row of expected[name]) await db.collections[name].insert(row);
					report.rows[name] = expected[name].length;
				}
		} finally {
			await db.close();
		}
	} catch (error) {
		report.problems.push(String(error.stack));
	}
	report.ok = report.problems.length === 0;
	process.stdout.write(`${JSON.stringify(report)}\n`);
	process.exitCode = report.ok ? 0 : 1;
}

main();
