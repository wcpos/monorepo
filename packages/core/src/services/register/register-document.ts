import { map } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

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
			registration?: { at: string; name: string; app_version: string };
		}
	>;
}

export async function readRegister(userDB: UserDatabase): Promise<RegisterDocument | null> {
	return (await userDB.getLocal<RegisterDocument>('register'))?.toJSON().data ?? null;
}

export async function ensureRegister(userDB: UserDatabase): Promise<RegisterDocument> {
	const existing = await readRegister(userDB);
	if (existing) return existing;
	const id = uuidv4().toLowerCase();
	const data: RegisterDocument = {
		id,
		name: `Register ${id.slice(-4).toUpperCase()}`,
		platform: AppInfo.platform,
		created_at: new Date().toISOString(),
		sites: {},
	};
	try {
		await userDB.insertLocal('register', data);
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
		const site = data.sites[siteUuid] ?? { sale_counter: 0 };
		counter = site.sale_counter + 1;
		return { ...data, sites: { ...data.sites, [siteUuid]: { ...site, sale_counter: counter } } };
	});
	return counter;
}
