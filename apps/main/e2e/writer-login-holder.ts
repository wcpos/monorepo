import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { log } from '@wcpos/utils/logger';

import type { WriterAuthorization } from './search-probe';

/**
 * One product-writer login holder per shard, in the Playwright runner process. Overlapping logins of
 * the one writer user overwrite each other's plugin session row, so a fresh token reads anonymous;
 * workers never log in, and read the holder's token from a 0600 file in a private temp dir.
 */

// globalSetup sets this before workers spawn; workers inherit it and read the file on every call.
export const WRITER_AUTH_FILE_ENV = 'E2E_PRODUCT_WRITER_AUTH_FILE';
// How often the holder checks expiry and renewal requests; well under the 2-minute renewal lead.
export const HOLDER_TICK_MS = 15_000;
// Renew this much before a reader could find less than the margin left.
export const HOLDER_RENEW_LEAD_MS = 2 * 60_000;
// A failed holder login is not retried sooner than this, so broken credentials cannot hammer the store.
export const HOLDER_FAILED_LOGIN_BACKOFF_MS = 60_000;
// A worker waits this long for the holder's renewal, re-reading the file every poll.
export const WRITER_WAIT_MS = 90_000;
export const WRITER_POLL_MS = 1_000;

export interface WriterClock {
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	random: () => number;
}

export const realWriterClock: WriterClock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	random: () => Math.random(),
};

/** 2-5 s, uniform: spreads retries so a token refused under the plugin race is not re-tried in lockstep. */
export function writerJitterMs(random: () => number): number {
	return 2_000 + Math.round(random() * 3_000);
}

export const writerStoreKey = (storeUrl: string): string => storeUrl.replace(/\/+$/, '');

/** A fresh private directory under the OS temp dir: never the repo, never an uploaded artifact. */
export function createWriterAuthFile(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wcpos-e2e-writer-')), 'writer-auth.json');
}

/** Temp file then rename, so a reader sees the old map or the new one, never a partial write. */
export function writeWriterAuthFile(file: string, published: Record<string, WriterAuthorization>) {
	const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
	fs.writeFileSync(temp, JSON.stringify(published), { mode: 0o600 });
	fs.renameSync(temp, file);
}

const writerRenewalMarker = (file: string, storeUrl: string): string =>
	`${file}.renew-${encodeURIComponent(writerStoreKey(storeUrl))}`;

/** A worker whose holder token was refused asks for one renewal; the holder acts on its next tick. */
export function requestWriterRenewal(file: string, storeUrl: string): void {
	fs.writeFileSync(writerRenewalMarker(file, storeUrl), '', { mode: 0o600 });
}

interface WriterLoginHolderOptions {
	file: string;
	storeUrls: string[];
	login: (storeUrl: string) => Promise<WriterAuthorization>;
	/** Renew once less than this much life remains (the readers' margin plus the lead). */
	renewBelowMs: number;
	now?: () => number;
}

export class WriterLoginHolder {
	private readonly held: Record<string, WriterAuthorization> = {};
	private readonly failedAt: Record<string, number> = {};
	private chain: Promise<void> = Promise.resolve();
	private timer: NodeJS.Timeout | undefined;

	constructor(private readonly options: WriterLoginHolderOptions) {}

	/** Every login in the shard runs inside this one chain: never two at once, across stores too. */
	private serialized(work: () => Promise<void>): Promise<void> {
		const run = this.chain.then(work);
		this.chain = run.catch(() => undefined);
		return run;
	}

	tick(): Promise<void> {
		return this.serialized(async () => {
			const now = this.options.now ?? Date.now;
			for (const storeUrl of this.options.storeUrls) {
				const key = writerStoreKey(storeUrl);
				const marker = writerRenewalMarker(this.options.file, storeUrl);
				const requested = fs.existsSync(marker);
				const held = this.held[key];
				const due = !held || held.expiresAt - now() < this.options.renewBelowMs;
				if (!requested && !due) continue;
				if (now() - (this.failedAt[key] ?? -Infinity) < HOLDER_FAILED_LOGIN_BACKOFF_MS) continue;
				fs.rmSync(marker, { force: true });
				try {
					this.held[key] = await this.options.login(storeUrl);
					delete this.failedAt[key];
					writeWriterAuthFile(this.options.file, this.held);
				} catch {
					this.failedAt[key] = now();
					log.warn('[writer-login-holder] product-writer login failed; retrying on a later tick');
				}
			}
		});
	}

	start(intervalMs = HOLDER_TICK_MS): void {
		this.timer = setInterval(() => void this.tick(), intervalMs);
		this.timer.unref();
	}

	async stop(): Promise<void> {
		clearInterval(this.timer);
		await this.chain;
	}
}
