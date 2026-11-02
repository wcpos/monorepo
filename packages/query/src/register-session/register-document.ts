import { map } from 'rxjs';

import { fromMinor, toMinor } from '@wcpos/order-math';
import type { ClosureRow, UserDatabase } from '@wcpos/database';
import { readTillAnchor, writeTillAnchor } from '@wcpos/database/till-anchor';
import { AppInfo } from '@wcpos/utils/app-info';
import { getLogger } from '@wcpos/utils/logger';

import type { DeepReadonly } from 'rxdb';

const registerLogger = getLogger(['wcpos', 'app', 'hydration']);

export type LiveSession = {
	session_id: string;
	status: 'open' | 'counting';
	opened_at_gmt: string;
	opened_by: { id: number; name: string } | null;
	acknowledged: boolean;
	expected_float: string | null;
	counted_float: string | null;
	business_day: string | null;
	seeded_in: readonly string[];
	counting_here: boolean;
	at: string;
};

type CarriedFrom = {
	session_id: string;
	closure_id: string;
	store_id: number;
	store_name: string;
	register_id: string;
};

export interface RegisterDocument {
	id: string;
	name: string;
	platform: 'ios' | 'android' | 'web' | 'electron';
	created_at: string;
	/**
	 * Set once the till id has been written to the anchor outside the database. A
	 * document without it predates the anchor and is adopted, never re-minted.
	 */
	anchored?: boolean;
	sites: Record<
		string,
		{
			sale_counter: number;
			bindings?: Record<string, { register_id: string; register_name: string | null }>;
			registers?: Record<
				string,
				Partial<RegisterCounters> & {
					live?: LiveSession;
					carried_from?: CarriedFrom;
					/** The session another till closed while this device held it live; cleared by the next open. */
					closed_elsewhere?: { session_id: string; at: string };
					closure_reservation?: { row: DeepReadonly<ClosureRow>; applied: boolean };
				}
			>;
			register_id?: string | null;
			register_name?: string | null;
			register_store_id?: number | null;
			store_id?: number | null;
			registration?: { at: string; name: string; app_version: string };
		}
	>;
}

let currentRegisterId: string | null = null;
let currentRegister: RegisterDocument | null = null;

export function getRegisterSnapshot(): RegisterDocument | null {
	return currentRegister;
}

export function getRegisterId(): string | null {
	return currentRegisterId;
}

export function mintUuid(): string {
	const id = globalThis.crypto?.randomUUID?.();
	if (id) return id;
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readRegister(userDB: UserDatabase): Promise<RegisterDocument | null> {
	const register = (await userDB.getLocal<RegisterDocument>('register'))?.toJSON(true).data ?? null;
	currentRegisterId = register?.id ?? null;
	currentRegister = register;
	return register;
}

/** The till's own identity: what a mint and a re-mint both draw fresh. */
type TillIdentity = Pick<RegisterDocument, 'id' | 'name' | 'created_at'>;

function mintTillIdentity(): TillIdentity {
	const id = mintUuid().toLowerCase();
	return {
		id,
		name: `Register ${id.slice(-4).toUpperCase()}`,
		created_at: new Date().toISOString(),
	};
}

/** Read the register, or mint it; `minted` says which happened. */
async function readOrMintRegister(
	userDB: UserDatabase,
	identity?: TillIdentity
): Promise<{ register: RegisterDocument; minted: boolean }> {
	const existing = await readRegister(userDB);
	if (existing) return { register: existing, minted: false };
	const data: RegisterDocument = {
		...(identity ?? mintTillIdentity()),
		platform: AppInfo.platform,
		sites: {},
	};
	try {
		await userDB.insertLocal('register', data);
		currentRegisterId = data.id;
		currentRegister = data;
		return { register: data, minted: true };
	} catch (error) {
		const winner = await readRegister(userDB);
		if (winner) return { register: winner, minted: false };
		throw error;
	}
}

/**
 * Give a cloned installation its own identity: a new till id and name, and every
 * site's sale counter back at zero, so its sales never share a till or a counter with
 * the copy it came from. What is kept as-is: the store bindings (`register_id`,
 * `register_store_id`) and each register's closure counters, which the server
 * validates against its own floor. What is not: a pending closure reservation, which
 * is the source till's closure in flight, not this one's. Without a document this is
 * a plain mint.
 */
export async function remintRegister(
	userDB: UserDatabase,
	identity: TillIdentity = mintTillIdentity(),
	expectedId?: string
): Promise<RegisterDocument> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) return (await readOrMintRegister(userDB, identity)).register;
	const updated = await doc.incrementalModify((data) =>
		// Compare-and-set: a till that is no longer `expectedId` was re-minted by another tab.
		expectedId !== undefined && data.id !== expectedId ? data : reminted(data, identity)
	);
	const register = updated.toJSON(true).data;
	currentRegisterId = register.id;
	currentRegister = register;
	return register;
}

function reminted(data: RegisterDocument, identity: TillIdentity): RegisterDocument {
	return {
		...data,
		...identity,
		sites: Object.fromEntries(
			Object.entries(data.sites).map(([site, bucket]) => [
				site,
				{
					...bucket,
					sale_counter: 0,
					...(bucket.registers
						? {
								registers: Object.fromEntries(
									Object.entries(bucket.registers).map(
										([register, { closure_reservation: _pending, live, ...counters }]) => [
											register,
											{
												...counters,
												...(live ? { live: { ...live, seeded_in: [], counting_here: false } } : {}),
											},
										]
									)
								),
							}
						: {}),
				},
			])
		),
	};
}

/** Record that this till's id is held by the anchor outside the database. */
export async function markAnchored(userDB: UserDatabase): Promise<RegisterDocument> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => ({ ...data, anchored: true }));
	const register = updated.toJSON(true).data;
	currentRegisterId = register.id;
	currentRegister = register;
	return register;
}

const UNWRITABLE_ANCHOR = 'Till anchor cannot be written; clone detection is off on this device';

/**
 * Settle the till's identity at hydration: read or mint the register, then compare its
 * id with the anchor kept outside the database (`@wcpos/database/till-anchor`). A
 * database copied from another installation carries that installation's till, and
 * becomes its own till before anything sells.
 *
 * - Anchor unreadable: nothing; an unreadable anchor must never cost a till its identity.
 * - Minted this boot: anchor it.
 * - Never anchored (it predates the anchor, or is a copy of a database that did; such a
 *   copy is accepted once): adopt it as this installation's till.
 * - Anchored, and the anchor matches: nothing.
 * - Anchored, and the anchor is absent or another till's: a clone, re-minted.
 *
 * A device that cannot persist its anchor keeps its till as it is; that is a degraded
 * state, not a merchant action, so it logs info.
 */
export async function settleRegister(userDB: UserDatabase): Promise<RegisterDocument> {
	const { register, minted } = await readOrMintRegister(userDB);
	const anchor = readTillAnchor();
	if (anchor === 'unknown') return register;
	if (anchor === register.id) return register.anchored ? register : markAnchored(userDB);
	if (minted || !register.anchored) {
		// Marked only once the anchor holds it, so a failed write is retried as an
		// adoption on a later boot instead of mistaken for a clone.
		if (!writeTillAnchor(register.id)) {
			registerLogger.info(UNWRITABLE_ANCHOR, { context: { anchor, till: register.id } });
			return register;
		}
		const anchored = await markAnchored(userDB);
		if (!minted) {
			registerLogger.info('Till anchored', { context: { till: register.id, previous: anchor } });
		}
		return anchored;
	}
	// Anchor first: a crash or a failed re-mint after this write leaves the fresh id
	// beside the cloned database, which the next boot reads as a mismatch and re-mints
	// again, so a failure costs one till id and never hides a clone.
	const identity = mintTillIdentity();
	if (!writeTillAnchor(identity.id)) {
		registerLogger.info(UNWRITABLE_ANCHOR, { context: { anchor, till: register.id } });
		return register;
	}
	const fresh = await remintRegister(userDB, identity, register.id);
	if (fresh.id !== identity.id) {
		// Another tab re-minted this database first: its id stands, and this write, the
		// later one, anchors it.
		writeTillAnchor(fresh.id);
		return fresh;
	}
	registerLogger.info('Till re-minted: the local database came from another installation', {
		context: { previous: register.id, next: fresh.id, anchor },
	});
	return fresh;
}

export function observeRegister$(userDB: UserDatabase) {
	return userDB
		.getLocal$<RegisterDocument>('register')
		.pipe(map((doc) => doc?.toJSON(true).data ?? null));
}

/** The register bound for a store of a site: its own binding, else the legacy pointer when that is this store's. */
export function boundRegisterIdOf(
	register: RegisterDocument | null | undefined,
	siteUuid: string,
	storeId?: number
): string | null {
	const site = register?.sites?.[siteUuid];
	const binding = site?.bindings?.[String(storeId ?? 0)];
	if (binding) return binding.register_id;
	// Legacy pointers have no store; the next bind writes it.
	if (
		storeId !== undefined &&
		site?.register_store_id != null &&
		site.register_store_id !== storeId
	)
		return null;
	return site?.register_id ?? null;
}

export function getBoundRegisterId(siteUuid: string, storeId?: number): string | null {
	return boundRegisterIdOf(currentRegister, siteUuid, storeId);
}

let currentSiteUuid: string | null = null;
let currentStoreId: number | undefined;

/** The bound register of the site/store last bound or read — for callers that hold no site handle. */
export function getCurrentBoundRegisterId(): string | null {
	return currentSiteUuid ? getBoundRegisterId(currentSiteUuid, currentStoreId) : null;
}

export async function readBoundRegister(userDB: UserDatabase, siteUuid: string, storeId?: number) {
	currentSiteUuid = siteUuid;
	currentStoreId = storeId;
	await readRegister(userDB);
	return getBoundRegister(siteUuid, storeId);
}

export function getBoundRegister(
	siteUuid: string,
	storeId?: number
): { id: string; name: string } | null {
	const site = currentRegister?.sites?.[siteUuid];
	const id = getBoundRegisterId(siteUuid, storeId);
	const binding = site?.bindings?.[String(storeId ?? 0)];
	return id ? { id, name: (binding ? binding.register_name : site?.register_name) ?? '' } : null;
}

export async function bindRegister(
	userDB: UserDatabase,
	siteUuid: string,
	register: { id: string | null; name: string | null },
	storeId?: number
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	currentSiteUuid = siteUuid;
	currentStoreId = storeId;
	const updated = await doc.incrementalModify((data) => ({
		...data,
		sites: {
			...data.sites,
			[siteUuid]: {
				...(data.sites[siteUuid] ?? { sale_counter: 0 }),
				bindings: {
					...data.sites[siteUuid]?.bindings,
					...(register.id
						? { [String(storeId ?? 0)]: { register_id: register.id, register_name: register.name } }
						: {}),
				},
				register_id: register.id,
				register_name: register.name,
				register_store_id: storeId ?? null,
			},
		},
	}));
	currentRegister = updated.toJSON(true).data;
}

export async function unbindRegister(
	userDB: UserDatabase,
	siteUuid: string,
	storeId?: number
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const site = data.sites[siteUuid];
		// A late unbind from one store must not clear a pointer another store has since written.
		const belongsElsewhere =
			storeId !== undefined &&
			site?.register_store_id != null &&
			site.register_store_id !== storeId;
		if (!site) return data;
		const bindings = { ...site.bindings };
		delete bindings[String(storeId ?? 0)];
		return {
			...data,
			sites: {
				...data.sites,
				[siteUuid]: {
					...site,
					bindings,
					...(!belongsElsewhere
						? { register_id: null, register_name: null, register_store_id: null }
						: {}),
				},
			},
		};
	});
	currentRegister = updated.toJSON(true).data;
}

export async function nextSaleCounter(userDB: UserDatabase, siteUuid: string): Promise<number> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	let counter = 0;
	// RxDB can batch modifiers and return the same final document to each caller.
	await doc.incrementalModify((data) => {
		const site = data.sites[siteUuid] ?? { sale_counter: 0, store_id: null };
		counter = site.sale_counter + 1;
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...site, sale_counter: counter } } };
	});
	return counter;
}

export type RegisterCounters = {
	last_closure_number: number;
	perpetual_sales_total: string;
	perpetual_refunds_total: string;
	counters_started_at?: string | null;
};
export async function adoptCounters(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	counters: RegisterCounters
) {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const register = bucket.registers?.[registerId] ?? {};
		// A closure already applied locally but not yet on the server sits on top of the
		// adopted floor: take its period out before the max and put it back after.
		const applied = register.closure_reservation?.applied ? register.closure_reservation.row : null;
		const periodSales = applied ? toMinor(applied.period_sales_total, 4) : 0;
		const periodRefunds = applied ? toMinor(applied.period_refunds_total, 4) : 0;
		const sales =
			Math.max(
				toMinor(register.perpetual_sales_total ?? '0', 4) - periodSales,
				toMinor(counters.perpetual_sales_total, 4)
			) + periodSales;
		const refunds =
			Math.max(
				toMinor(register.perpetual_refunds_total ?? '0', 4) - periodRefunds,
				toMinor(counters.perpetual_refunds_total, 4)
			) + periodRefunds;
		const registers = {
			...bucket.registers,
			[registerId]: {
				...register,
				last_closure_number: Math.max(
					register.last_closure_number ?? 0,
					counters.last_closure_number
				),
				perpetual_sales_total: fromMinor(sales, 4),
				perpetual_refunds_total: fromMinor(refunds, 4),
				counters_started_at: register.counters_started_at ?? counters.counters_started_at ?? null,
				...(applied && register.closure_reservation
					? {
							closure_reservation: {
								...register.closure_reservation,
								row: {
									...applied,
									perpetual_sales_total: fromMinor(sales, 4),
									perpetual_refunds_total: fromMinor(refunds, 4),
								},
							},
						}
					: {}),
			},
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}
/** The server's counters, or null when the payload cannot be trusted as a floor. */
export function readCounters(input: unknown): RegisterCounters | null {
	const value = input as Partial<Record<keyof RegisterCounters, unknown>> | null | undefined;
	if (!value || typeof value !== 'object') return null;
	const number = Number(value.last_closure_number);
	const money = (amount: unknown) =>
		(typeof amount === 'string' || typeof amount === 'number') && Number.isFinite(Number(amount))
			? String(amount)
			: null;
	const sales = money(value.perpetual_sales_total);
	const refunds = money(value.perpetual_refunds_total);
	if (!Number.isInteger(number) || number < 0 || sales === null || refunds === null) return null;
	return {
		last_closure_number: number,
		perpetual_sales_total: sales,
		perpetual_refunds_total: refunds,
		counters_started_at:
			typeof value.counters_started_at === 'string' ? value.counters_started_at : null,
	};
}
export async function mintClosureNumber(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	closure?: DeepReadonly<ClosureRow>
): Promise<number> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	let number = 0;
	await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const register = bucket.registers?.[registerId] ?? {};
		if (
			closure &&
			register.closure_reservation?.row.id === closure.id &&
			!!register.closure_reservation.row.number_retried === !!closure.number_retried
		) {
			number = register.closure_reservation.row.number;
			return data;
		}
		if (
			closure &&
			register.closure_reservation &&
			register.closure_reservation.row.id !== closure.id &&
			!register.closure_reservation.applied
		)
			throw new Error('closure_write_incomplete');
		number = (register.last_closure_number ?? 0) + 1;
		// A re-mint of a closure whose period was already applied to the register must not
		// add it again: the register totals already carry it.
		const applied =
			closure &&
			register.closure_reservation?.row.id === closure.id &&
			register.closure_reservation.applied
				? register.closure_reservation.row
				: null;
		const sales = closure
			? toMinor(register.perpetual_sales_total ?? '0', 4) -
				(applied ? toMinor(applied.period_sales_total, 4) : 0) +
				toMinor(closure.period_sales_total, 4)
			: 0;
		const refunds = closure
			? toMinor(register.perpetual_refunds_total ?? '0', 4) -
				(applied ? toMinor(applied.period_refunds_total, 4) : 0) +
				toMinor(closure.period_refunds_total, 4)
			: 0;
		const reservation = closure
			? {
					row: {
						...closure,
						number,
						perpetual_sales_total: fromMinor(sales, 4),
						perpetual_refunds_total: fromMinor(refunds, 4),
					},
					applied: !!applied || !!closure.number_retried,
				}
			: register.closure_reservation;
		const registers = {
			...bucket.registers,
			[registerId]: {
				...register,
				last_closure_number: number,
				...(reservation ? { closure_reservation: reservation } : {}),
				// An applied period follows the closure row it came from.
				...(applied
					? {
							perpetual_sales_total: fromMinor(sales, 4),
							perpetual_refunds_total: fromMinor(refunds, 4),
						}
					: {}),
			},
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	return number;
}
export async function advancePerpetual(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	period: { sales: string; refunds: string; closureId?: string }
) {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const register = bucket.registers?.[registerId] ?? {};
		const reservation = register.closure_reservation;
		if (
			period.closureId &&
			(!reservation || reservation.row.id !== period.closureId || reservation.applied)
		)
			return data;
		const registers = {
			...bucket.registers,
			[registerId]: {
				...register,
				...(period.closureId && reservation
					? { closure_reservation: { ...reservation, applied: true } }
					: {}),
				perpetual_sales_total: fromMinor(
					period.closureId && reservation
						? Math.max(
								toMinor(register.perpetual_sales_total ?? '0', 4),
								toMinor(reservation.row.perpetual_sales_total, 4)
							)
						: toMinor(register.perpetual_sales_total ?? '0', 4) + toMinor(period.sales, 4),
					4
				),
				perpetual_refunds_total: fromMinor(
					period.closureId && reservation
						? Math.max(
								toMinor(register.perpetual_refunds_total ?? '0', 4),
								toMinor(reservation.row.perpetual_refunds_total, 4)
							)
						: toMinor(register.perpetual_refunds_total ?? '0', 4) + toMinor(period.refunds, 4),
					4
				),
				counters_started_at: register.counters_started_at ?? new Date().toISOString(),
			},
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}

export function readLiveSession(siteUuid: string, registerId: string): LiveSession | null {
	return currentRegister?.sites[siteUuid]?.registers?.[registerId]?.live ?? null;
}

/** The session another till closed while this device held it live, until the next open. */
export function readClosedElsewhere(siteUuid: string, registerId: string) {
	return currentRegister?.sites[siteUuid]?.registers?.[registerId]?.closed_elsewhere ?? null;
}

export async function recordLiveSession(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	live: Omit<LiveSession, 'seeded_in' | 'counting_here' | 'at'> | null
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const register = { ...bucket.registers?.[registerId] };
		if (live) {
			register.live = {
				...live,
				counting_here:
					live.session_id === register.live?.session_id && live.status === 'counting'
						? (register.live.counting_here ?? false)
						: false,
				seeded_in: live.session_id === register.live?.session_id ? register.live.seeded_in : [],
				at: new Date().toISOString(),
			};
			delete register.closed_elsewhere;
		} else {
			// Ended without this device's count mark: closed on another till; kept until the next open.
			if (register.live && !register.live.counting_here)
				register.closed_elsewhere = {
					session_id: register.live.session_id,
					at: new Date().toISOString(),
				};
			delete register.live;
		}
		const registers = { ...bucket.registers, [registerId]: register };
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}

export async function markSeededIn(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	storeDbName: string
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid];
		const register = bucket?.registers?.[registerId];
		if (!register?.live || register.live.seeded_in.includes(storeDbName)) return data;
		const live = { ...register.live, seeded_in: [...register.live.seeded_in, storeDbName] };
		const registers = { ...bucket.registers, [registerId]: { ...register, live } };
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}

export async function markCountingHere(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	here: boolean
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid];
		const register = bucket?.registers?.[registerId];
		if (!register?.live) return data;
		const live = { ...register.live, counting_here: here };
		const registers = { ...bucket.registers, [registerId]: { ...register, live } };
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}

export async function recordCarriedFrom(
	userDB: UserDatabase,
	siteUuid: string,
	registerId: string,
	note: CarriedFrom
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const registers = {
			...bucket.registers,
			[registerId]: { ...bucket.registers?.[registerId], carried_from: note },
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
}

export function readCarriedFrom(
	siteUuid: string,
	registerId: string,
	sessionId: string
): Omit<CarriedFrom, 'session_id'> | null {
	const note = currentRegister?.sites[siteUuid]?.registers?.[registerId]?.carried_from;
	if (note?.session_id !== sessionId) return null;
	const { session_id: _, ...source } = note;
	return source;
}

export async function bindStoreRegister(
	userDB: UserDatabase,
	siteUuid: string,
	storeId: number,
	register: { id: string; name: string }
): Promise<void> {
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc) throw new Error('Register is not initialized');
	const updated = await doc.incrementalModify((data) => {
		const bucket = data.sites[siteUuid] ?? { sale_counter: 0 };
		const bindings = {
			...bucket.bindings,
			[String(storeId)]: { register_id: register.id, register_name: register.name },
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, bindings } } };
	});
	currentRegister = updated.toJSON(true).data;
}
