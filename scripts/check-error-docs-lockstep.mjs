import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const registryUrl = new URL('../packages/utils/src/logger/error-registry.json', import.meta.url);
const docsBaseUrl = 'https://raw.githubusercontent.com/wcpos/docs/main/versioned_docs/version-1.x/error-codes';

export async function checkErrorDocsLockstep(codes, options = {}) {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const printMissing = options.printMissing ?? console.error;
	const warn = options.warn ?? console.warn;
	const missing = [];

	for (const code of codes) {
		try {
			const response = await fetchImpl(`${docsBaseUrl}/${code}.mdx`, { method: 'HEAD' });
			if (response.status === 404) missing.push(code);
			else if (!response.ok) warn(`Warning: could not check ${code} (HTTP ${response.status})`);
		} catch (error) {
			warn(`Warning: could not check ${code} (${error instanceof Error ? error.message : error})`);
		}
	}

	for (const code of missing) printMissing(`Missing error docs page: ${code}`);
	return missing.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
	process.exitCode = await checkErrorDocsLockstep(registry.map(({ code }) => code));
}
