import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { log } from '@wcpos/utils/logger';

import type { WriterAuthorization } from './search-probe';

/**
 * One product-writer login holder per shard, in the Playwright runner process. Overlapping logins of
 * the one writer user overwrite each other's plugin session row, so a fresh token reads anonymous;
 * workers never log in, and read the holder's token from a 0600 file in a private temp dir.
 * Every login also adds an entry to that row (evicted only after 7 days), so the holder logs in only
 * when a worker asks, never on a timer.
 */

// globalSetup sets this before workers spawn; workers inherit it and read the file on every call.
export const WRITER_AUTH_FILE_ENV = 'E2E_PRODUCT_WRITER_AUTH_FILE';
// How often the holder looks for renewal requests: one stat per store, never a login of its own.
export const HOLDER_TICK_MS = 1_000;
// A failed holder login or validation is not retried sooner than this, so broken credentials cannot hammer the store.
export const HOLDER_FAILED_LOGIN_BACKOFF_MS = 60_000;
// Same-index shards of concurrent runs start, and so first ask, together: 0-15 s spreads their logins.
export const HOLDER_LOGIN_JITTER_MS = 15_000;
// A worker waits this long for the holder's renewal, re-reading the file every poll.
export const WRITER_WAIT_MS = 90_000;
export const WRITER_POLL_MS = 1_000;
// The fingerprint a worker sends when the file had no token for its store.
export const WRITER_FINGERPRINT_NONE = 'none';

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

/** What a renewal request names: never the token itself. */
export const writerFingerprint = (authorization: WriterAuthorization | null): string =>
	authorization
		? createHash('sha256').update(authorization.value).digest('hex')
		: WRITER_FINGERPRINT_NONE;

/** A fresh private directory under the OS temp dir: never the repo, never an uploaded artifact. */
export function createWriterAuthFile(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wcpos-e2e-writer-')), 'writer-auth.json');
}

/** Temp file then rename, so a reader sees the old content or the new one, never a partial write. */
function writeAtomically(file: string, content: string) {
	const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
	fs.writeFileSync(temp, content, { mode: 0o600 });
	fs.renameSync(temp, file);
}

export function writeWriterAuthFile(file: string, published: Record<string, WriterAuthorization>) {
	writeAtomically(file, JSON.stringify(published));
}

const writerRenewalMarker = (file: string, storeUrl: string): string =>
	`${file}.renew-${encodeURIComponent(writerStoreKey(storeUrl))}`;

/** A worker whose token is short or refused asks for one renewal, naming the token it saw. */
export function requestWriterRenewal(
	file: string,
	storeUrl: string,
	seen: WriterAuthorization | null
): void {
	writeAtomically(writerRenewalMarker(file, storeUrl), writerFingerprint(seen));
}

/** Take the marker (rename, then read), so a request written after this lands for the next tick. */
function claimRenewalRequest(marker: string): string | null {
	const claimed = `${marker}.claimed`;
	try {
		fs.renameSync(marker, claimed);
		return fs.readFileSync(claimed, 'utf8');
	} catch {
		return null;
	} finally {
		fs.rmSync(claimed, { force: true });
	}
}

interface WriterLoginHolderOptions {
	file: string;
	storeUrls: string[];
	login: (storeUrl: string) => Promise<WriterAuthorization>;
	/** One products read with a fresh token; it is published only when this accepts it. */
	validate: (storeUrl: string, authorization: WriterAuthorization) => Promise<boolean>;
	clock?: Partial<WriterClock>;
}

export class WriterLoginHolder {
	private readonly held: Record<string, WriterAuthorization> = {};
	private readonly failedAt: Record<string, number> = {};
	private readonly clock: WriterClock;
	private chain: Promise<void> = Promise.resolve();
	private timer: NodeJS.Timeout | undefined;

	constructor(private readonly options: WriterLoginHolderOptions) {
		this.clock = { ...realWriterClock, ...options.clock };
	}

	/** Every login in the shard runs inside this one chain: never two at once, across stores too. */
	private serialized(work: () => Promise<void>): Promise<void> {
		const run = this.chain.then(work);
		this.chain = run.catch(() => undefined);
		return run;
	}

	/** Act on renewal requests only; a request naming a token older than the held one is dropped. */
	tick(): Promise<void> {
		return this.serialized(async () => {
			for (const storeUrl of this.options.storeUrls) {
				const key = writerStoreKey(storeUrl);
				const marker = writerRenewalMarker(this.options.file, storeUrl);
				if (!fs.existsSync(marker)) continue;
				// Inside the backoff the request stays, and is acted on once the backoff ends.
				if (this.clock.now() - (this.failedAt[key] ?? -Infinity) < HOLDER_FAILED_LOGIN_BACKOFF_MS)
					continue;
				const asked = claimRenewalRequest(marker);
				if (asked !== writerFingerprint(this.held[key] ?? null)) continue;
				await this.renew(storeUrl, key);
			}
		});
	}

	private async renew(storeUrl: string, key: string): Promise<void> {
		const { now, sleep, random } = this.clock;
		await sleep(Math.round(random() * HOLDER_LOGIN_JITTER_MS));
		try {
			const fresh = await this.options.login(storeUrl);
			if (!(await this.validated(storeUrl, fresh))) {
				this.failedAt[key] = now();
				log.warn(
					'[writer-login-holder] a fresh product-writer token was refused; keeping the old one'
				);
				return;
			}
			this.held[key] = fresh;
			delete this.failedAt[key];
			writeWriterAuthFile(this.options.file, this.held);
		} catch {
			this.failedAt[key] = now();
			log.warn('[writer-login-holder] product-writer login failed; retrying on a later request');
		}
	}

	/** One products read; a refusal waits 2-5 s and reads once more (the plugin race can settle). */
	private async validated(storeUrl: string, fresh: WriterAuthorization): Promise<boolean> {
		if (await this.options.validate(storeUrl, fresh)) return true;
		await this.clock.sleep(writerJitterMs(this.clock.random));
		return this.options.validate(storeUrl, fresh);
	}

	start(intervalMs = HOLDER_TICK_MS): void {
		let ticking = false;
		this.timer = setInterval(() => {
			if (ticking) return;
			ticking = true;
			void this.tick()
				.catch(() => undefined)
				.finally(() => (ticking = false));
		}, intervalMs);
		this.timer.unref();
	}

	async stop(): Promise<void> {
		clearInterval(this.timer);
		await this.chain;
	}
}
