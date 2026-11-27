// One-off proof for #3870 on a do-not-merge PR, never merged. Reads the store only.
import { expect, type Page } from '@playwright/test';

import {
	getStoreVariant,
	hydrateAuthenticatedPage,
	authenticatedTest as test,
	wcposRestRoute,
} from './fixtures';

// Cut off the first run while page 9 is in flight, so page 8 is the last checkpointed page.
const HOLD_PAGE = 9;

function historyUrl(url: URL) {
	return (
		wcposRestRoute(url.href) === '/wcpos/v2/refunds' &&
		url.searchParams.has('after') &&
		!url.searchParams.has('parent')
	);
}

test.describe.configure({ retries: 0 });

test('interrupted refund history walk resumes from its checkpoint', async ({ page }, testInfo) => {
	test.setTimeout(15 * 60_000);
	test.skip(getStoreVariant(testInfo) !== 'pro', 'refund history walk proof runs on pro only');

	type Observation = {
		run: 1 | 2;
		page: number;
		after: string | null;
		perPage: number;
		status: number;
		total: number;
		totalPages: number;
		ids: number[];
		error?: string;
	};
	const observations: Observation[] = [];
	const bodies: Promise<void>[] = [];
	let otherRefundRequests = 0;
	function watch(p: Page, run: 1 | 2) {
		p.on('request', (request) => {
			const url = new URL(request.url());
			if (
				wcposRestRoute(url.href) === '/wcpos/v2/refunds' &&
				!(request.method() === 'GET' && historyUrl(url))
			) {
				otherRefundRequests++;
			}
		});
		p.on('response', (response) => {
			const url = new URL(response.url());
			if (response.request().method() !== 'GET' || !historyUrl(url)) return;
			const headers = response.headers();
			const record: Observation = {
				run,
				page: Number(url.searchParams.get('page')),
				after: url.searchParams.get('after'),
				perPage: Number(url.searchParams.get('per_page')),
				status: response.status(),
				total: Number(headers['x-wp-total']),
				totalPages: Number(headers['x-wp-totalpages']),
				ids: [],
			};
			observations.push(record);
			bodies.push(
				(async () => {
					try {
						const rows: { id: number }[] = await response.json();
						record.ids = rows.map((row) => row.id);
					} catch (error) {
						record.error = error instanceof Error ? error.message : String(error);
					}
				})()
			);
		});
	}

	let markHeld!: () => void;
	const held = new Promise<void>((resolve) => {
		markHeld = resolve;
	});
	let markClosed!: () => void;
	const closed = new Promise<void>((resolve) => {
		markClosed = resolve;
	});
	let heldAfter: string | null = null;
	let heldPage: number | null = null;
	watch(page, 1);
	await page.route(historyUrl, async (route) => {
		const request = route.request();
		const params = new URL(request.url()).searchParams;
		const requestedPage = Number(params.get('page'));
		if (request.method() !== 'GET' || requestedPage !== HOLD_PAGE) return route.fallback();
		heldAfter = params.get('after');
		heldPage = requestedPage;
		markHeld();
		await closed;
		try {
			await route.abort();
		} catch {
			// The tab is already closed.
		}
	});
	await hydrateAuthenticatedPage(page, testInfo, {
		ignoreSavedState: true,
		waitForCatalogue: false,
	});
	let timer: ReturnType<typeof setTimeout>;
	const holdTimeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const highest = Math.max(0, ...observations.map((record) => record.page));
			const totalPages = observations.at(-1)?.totalPages ?? 'unknown';
			reject(
				new Error(
					`Page ${HOLD_PAGE} not held: highest page seen=${highest}, totalPages=${totalPages}; need at least ${HOLD_PAGE + 1} pages`
				)
			);
		}, 10 * 60_000);
	});
	await Promise.race([held, holdTimeout]).finally(() => clearTimeout(timer));
	await page.close();
	markClosed();

	const resumed = await page.context().newPage();
	watch(resumed, 2);
	try {
		let resumeError: unknown = null;
		await Promise.all([
			resumed.waitForResponse(
				(response) => {
					const url = new URL(response.url());
					return (
						response.request().method() === 'GET' &&
						historyUrl(url) &&
						Number(url.searchParams.get('page')) === Number(response.headers()['x-wp-totalpages'])
					);
				},
				{ timeout: 6 * 60_000 }
			),
			resumed.goto('/'),
		]).catch((error: unknown) => {
			resumeError = error;
		});
		await Promise.all(bodies);
		const first = observations.filter((record) => record.run === 1);
		const second = observations.filter((record) => record.run === 2);
		const pagesById = new Map<number, number>();
		const duplicates = new Set<number>();
		for (const record of observations) {
			for (const id of record.ids) {
				if (pagesById.has(id) && pagesById.get(id) !== record.page) duplicates.add(id);
				pagesById.set(id, record.page);
			}
		}
		const figures = {
			run1Pages: first.map((record) => record.page),
			run2Pages: second.map((record) => record.page),
			heldPage,
			heldAfter,
			resumeFirstPage: second[0]?.page ?? null,
			resumeAfter: second[0]?.after ?? null,
			afterUnchanged: second.every((record) => record.after === heldAfter),
			total: second.at(-1)?.total ?? null,
			totalFirst: first[0]?.total ?? null,
			union: pagesById.size,
			duplicates: [...duplicates],
			restart: second.slice(1).some((record) => record.page === 1),
			otherRefundRequests,
			completed: resumeError === null,
			resumeError:
				resumeError === null
					? null
					: resumeError instanceof Error
						? resumeError.message
						: String(resumeError),
		};
		console.log('REFUND_WALK_PROOF ' + JSON.stringify(figures));
		await testInfo.attach('refund-walk-proof.json', {
			body: JSON.stringify(figures, null, 2),
			contentType: 'application/json',
		});
		if (resumeError) throw resumeError;
		expect(figures.resumeFirstPage, 'resume from the last checkpointed page').toBe(HOLD_PAGE - 1);
		expect(figures.afterUnchanged, 'keep the interrupted history window').toBe(true);
		expect(figures.restart, 'do not restart at page 1').toBe(false);
		expect(figures.union, 'cover every refund reported by the store').toBe(figures.total);
		expect(figures.duplicates.length, 'no refund appears on two distinct pages').toBe(0);
	} finally {
		await resumed.close();
	}
});
