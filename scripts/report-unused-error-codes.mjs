import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOTS = ['packages', 'apps/main'];
const EXCLUDED_DIRECTORIES = new Set(['__tests__', 'e2e', 'node_modules']);
const TEST_FILE = /\.test\.[jt]sx?$/;

async function listSourceFiles(directory, root) {
	const relative = path.relative(root, directory);
	if (relative === path.join('packages', 'utils', 'src', 'logger')) return [];

	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const child = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : listSourceFiles(child, root);
			}
			if (!/\.tsx?$/.test(entry.name) || TEST_FILE.test(entry.name)) return [];
			return [child];
		})
	);
	return files.flat();
}

const occurrences = (source, pattern) => source.match(pattern)?.length ?? 0;

export async function scanErrorCodeUsage(registry, root = repoRoot) {
	const counts = new Map(registry.map(({ code }) => [code, 0]));
	const files = (
		await Promise.all(
			SOURCE_ROOTS.map(async (sourceRoot) => {
				const directory = path.join(root, sourceRoot);
				return listSourceFiles(directory, root);
			})
		)
	).flat();

	for (const file of files) {
		const source = await readFile(file, 'utf8');
		for (const { code, symbol } of registry) {
			const literal = new RegExp(`(['"])${code}\\1`, 'g');
			const generated = new RegExp(`\\bERROR_CODES\\.${symbol}\\b`, 'g');
			counts.set(
				code,
				counts.get(code) + occurrences(source, literal) + occurrences(source, generated)
			);
		}
	}
	return counts;
}

export async function reportUnusedErrorCodes(root = repoRoot) {
	const registry = JSON.parse(
		await readFile(path.join(root, 'packages/utils/src/logger/error-registry.json'), 'utf8')
	);
	const counts = await scanErrorCodeUsage(registry, root);
	for (const [code, count] of counts) console.log(`${code}\t${count}`);

	const unused = [...counts].filter(([, count]) => count === 0).map(([code]) => code);
	console.log(`\nNever emitted (${unused.length})`);
	for (const code of unused) console.log(code);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	reportUnusedErrorCodes().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
	});
}
