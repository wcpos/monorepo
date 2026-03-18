import { FETCH_TIMEOUT_MS } from './constants';

/**
 * Default (web + native) implementation: fetch the URL and print the HTML.
 */
export async function printFromUrl(
	url: string,
	printHtml: (html: string) => Promise<void>
): Promise<void> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	let html: string;
	try {
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (!response.ok) {
			throw new Error(`Failed to fetch receipt: ${response.status}`);
		}
		html = await response.text();
	} catch (err) {
		clearTimeout(timeoutId);
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new Error(`Receipt fetch timed out after ${FETCH_TIMEOUT_MS}ms`);
		}
		throw err;
	}

	await printHtml(html);
}
