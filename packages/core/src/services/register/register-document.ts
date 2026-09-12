import { map } from 'rxjs';

import { fromMinor, toMinor } from '@wcpos/order-math';
import type { ClosureRow, UserDatabase } from '@wcpos/database';
import { AppInfo } from '@wcpos/utils/app-info';

import type { DeepReadonly } from 'rxdb';

export interface RegisterDocument {
	id: string;
	name: string;
	platform: 'ios' | 'android' | 'web' | 'electron';
	created_at: string;
	sites: Record<
		string,
		{
			sale_counter: number;
			registers?: Record<
				string,
				Partial<RegisterCounters> & {
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

export async function ensureRegister(userDB: UserDatabase): Promise<RegisterDocument> {
	const existing = await readRegister(userDB);
	if (existing) return existing;
	const id = mintUuid().toLowerCase();
	const data: RegisterDocument = {
		id,
		name: `Register ${id.slice(-4).toUpperCase()}`,
		platform: AppInfo.platform,
		created_at: new Date().toISOString(),
		sites: {},
	};
	try {
		await userDB.insertLocal('register', data);
		currentRegisterId = data.id;
		currentRegister = data;
		return data;
	} catch (error) {
		const winner = await readRegister(userDB);
		if (winner) return winner;
		throw error;
	}
}

export function observeRegister$(userDB: UserDatabase) {
	return userDB
		.getLocal$<RegisterDocument>('register')
		.pipe(map((doc) => doc?.toJSON(true).data ?? null));
}

export function getBoundRegisterId(siteUuid: string, storeId?: number): string | null {
	const site = currentRegister?.sites?.[siteUuid];
	// Legacy pointers have no store; the next bind writes it.
	if (
		storeId !== undefined &&
		site?.register_store_id != null &&
		site.register_store_id !== storeId
	)
		return null;
	return site?.register_id ?? null;
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
	const site = (await readRegister(userDB))?.sites?.[siteUuid];
	const id = getBoundRegisterId(siteUuid, storeId);
	return id ? { id, name: site?.register_name ?? '' } : null;
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
		if (!site || belongsElsewhere) return data;
		return {
			...data,
			sites: {
				...data.sites,
				[siteUuid]: { ...site, register_id: null, register_name: null, register_store_id: null },
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
		const registers = {
			...bucket.registers,
			[registerId]: {
				...register,
				last_closure_number: Math.max(
					register.last_closure_number ?? 0,
					counters.last_closure_number
				),
				perpetual_sales_total: fromMinor(
					Math.max(
						toMinor(register.perpetual_sales_total ?? '0', 4),
						toMinor(counters.perpetual_sales_total, 4)
					),
					4
				),
				perpetual_refunds_total: fromMinor(
					Math.max(
						toMinor(register.perpetual_refunds_total ?? '0', 4),
						toMinor(counters.perpetual_refunds_total, 4)
					),
					4
				),
				counters_started_at: register.counters_started_at ?? counters.counters_started_at ?? null,
			},
		};
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...bucket, registers } } };
	});
	currentRegister = updated.toJSON(true).data;
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
		const reservation = closure
			? {
					row: {
						...closure,
						number,
						perpetual_sales_total: fromMinor(
							toMinor(register.perpetual_sales_total ?? '0', 4) +
								toMinor(closure.period_sales_total, 4),
							4
						),
						perpetual_refunds_total: fromMinor(
							toMinor(register.perpetual_refunds_total ?? '0', 4) +
								toMinor(closure.period_refunds_total, 4),
							4
						),
					},
					applied: closure.number_retried ? true : false,
				}
			: register.closure_reservation;
		const registers = {
			...bucket.registers,
			[registerId]: {
				...register,
				last_closure_number: number,
				...(reservation ? { closure_reservation: reservation } : {}),
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
