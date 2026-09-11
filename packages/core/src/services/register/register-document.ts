import { map } from 'rxjs';

import type { UserDatabase } from '@wcpos/database';
import { AppInfo } from '@wcpos/utils/app-info';

export interface RegisterDocument {
	id: string;
	name: string;
	platform: 'ios' | 'android' | 'web' | 'electron';
	created_at: string;
	sites: Record<
		string,
		{
			sale_counter: number;
			store_id?: number | null;
			registration?: { at: string; name: string; app_version: string };
		}
	>;
}

let currentRegisterId: string | null = null;

export function getRegisterId(): string | null {
	return currentRegisterId;
}

function mintUuid(): string {
	const id = globalThis.crypto?.randomUUID?.();
	if (id) return id;
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readRegister(userDB: UserDatabase): Promise<RegisterDocument | null> {
	const register = (await userDB.getLocal<RegisterDocument>('register'))?.toJSON().data ?? null;
	currentRegisterId = register?.id ?? null;
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
		.pipe(map((doc) => doc?.toJSON().data ?? null));
}

export async function renameRegister(userDB: UserDatabase, name: string): Promise<boolean> {
	name = name.trim();
	if (!name || name.length > 191) return false;
	const doc = await userDB.getLocal<RegisterDocument>('register');
	if (!doc || doc.get('name') === name) return false;
	await doc.incrementalModify((data) => ({ ...data, name }));
	return true;
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
