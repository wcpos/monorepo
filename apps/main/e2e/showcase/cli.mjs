#!/usr/bin/env node
/** The showcase seed's commands (see README.md). Stdout is counts only. Exit 0 ok, 1 store error, 2 safety stop, 64 usage. */
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { TransientStoreError } from '../../../../scripts/store-transient-retry.mjs';
import { readStoreFacts, runApply, SeedSafetyError, verify } from './apply.mjs';
import { createClient, readCredentials as defaultReadCredentials, StoreError } from './client.mjs';
import { planCustomers, planOrders, summarise } from './plan.mjs';
import { TARGETS } from './targets.mjs';

/** `plan` runs offline against this many synthetic product ids. */
const SYNTHETIC_PRODUCT_COUNT = 200;
const USAGE =
	'usage: cli.mjs <plan|apply|verify> --target <demo|dev-free> [--credentials-cmd <path>] [--yes] [--limit N] [--through <ISO>]';
const OPTIONS = {
	target: { type: 'string' },
	'credentials-cmd': { type: 'string' },
	yes: { type: 'boolean' },
	limit: { type: 'string' },
	through: { type: 'string' },
};

/** Only messages built from ids, counts, statuses and codes are printed; any other error prints its name. */
const safeMessage = (err) =>
	[StoreError, SeedSafetyError, TransientStoreError].some((E) => err instanceof E)
		? err.message
		: (err?.name ?? 'Error');

export async function run(
	argv,
	{ fetchImpl = fetch, sleep, log = console.log, readCredentials = defaultReadCredentials } = {}
) {
	let parsed;
	try {
		parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
	} catch {
		parsed = null;
	}
	const { values = {}, positionals: [command] = [] } = parsed ?? {};
	const target = Object.hasOwn(TARGETS, values.target ?? '') ? TARGETS[values.target] : null;
	const through = values.through ? new Date(values.through) : new Date();
	const limit = values.limit === undefined ? Infinity : Number(values.limit);
	const usable =
		['plan', 'apply', 'verify'].includes(command) && target && !Number.isNaN(through.getTime());
	if (
		!usable ||
		!(limit === Infinity || (Number.isInteger(limit) && limit > 0)) ||
		(command !== 'plan' && !values['credentials-cmd'])
	) {
		log(USAGE);
		return 64;
	}
	if (command === 'plan') {
		const storeFacts = Object.fromEntries(target.stores.map((s) => [s.key, { timeZone: 'UTC' }]));
		const products = Array.from({ length: SYNTHETIC_PRODUCT_COUNT }, (_, i) => ({
			id: i + 1,
			price: '10.00',
		}));
		log(
			JSON.stringify(
				summarise(
					planOrders(target, { storeFacts, products, customers: planCustomers(target), through })
				)
			)
		);
		return 0;
	}
	let client;
	try {
		const credentials = await readCredentials(values['credentials-cmd']);
		client = createClient({
			url: target.url,
			credentials,
			fetchImpl,
			...(sleep ? { sleep } : {}),
			log,
		});
		if (command === 'verify') {
			const facts = await readStoreFacts(client, target);
			const orders = planOrders(target, {
				storeFacts: facts.storeFacts,
				products: facts.products,
				customers: planCustomers(target),
				through,
			});
			log(JSON.stringify(await verify(client, target, orders)));
		} else {
			const write = values.yes === true;
			const { counts } = await runApply(client, target, { write, limit, through, log });
			log(JSON.stringify({ write, counts, stats: client.stats }));
		}
		return 0;
	} catch (err) {
		log(`stopped: ${safeMessage(err)}`);
		if (err?.counts) log(JSON.stringify({ counts: err.counts, stats: client?.stats }));
		return err instanceof SeedSafetyError ? 2 : 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await run(process.argv.slice(2));
}
