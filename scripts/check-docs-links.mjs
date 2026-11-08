import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const EXCLUDED = /\.(test|spec)\.|\/(?:__tests__|__mocks__|e2e|node_modules)\//;

export function loadRoutes(text) {
	return new Set(
		text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
	);
}

export function extractDocsLinks(source) {
	return source.match(/https:\/\/docs\.wcpos\.com[A-Za-z0-9._~/%?=&#-]*/g) ?? [];
}

export function docsPath(url) {
	return url.replace('https://docs.wcpos.com', '').split(/[?#]/)[0].replace(/\/$/, '') || '/';
}

export function findBadLinks({ files, routes, readFile }) {
	return files.flatMap((file) =>
		extractDocsLinks(readFile(file))
			.filter((url) => docsPath(url) !== '/' && !routes.has(docsPath(url)))
			.map((url) => ({ file, url }))
	);
}

export function missingErrorCodePages({ codes, routes }) {
	return codes.filter((code) => !routes.has(`/error-codes/${code}`));
}

function main() {
	const routes = loadRoutes(
		readFileSync(path.join(repoRoot, 'scripts/docs-routes-2x.txt'), 'utf8')
	);
	const codes = JSON.parse(
		readFileSync(path.join(repoRoot, 'packages/utils/src/logger/error-registry.json'), 'utf8')
	).map(({ code }) => code);
	const files = execFileSync('git', ['ls-files', '-z', 'apps', 'packages'], {
		cwd: repoRoot,
		encoding: 'utf8',
	})
		.split('\0')
		.filter(
			(file) =>
				SOURCE_EXTENSIONS.has(path.extname(file)) &&
				!EXCLUDED.test(file) &&
				statSync(path.join(repoRoot, file), { throwIfNoEntry: false })?.isFile()
		);
	let linkCount = 0;
	const badLinks = findBadLinks({
		files,
		routes,
		readFile(file) {
			const source = readFileSync(path.join(repoRoot, file), 'utf8');
			linkCount += extractDocsLinks(source).length;
			return source;
		},
	});
	const missingCodes = missingErrorCodePages({ codes, routes });
	for (const { file, url } of badLinks) console.error(`${file}: ${url}`);
	for (const code of missingCodes) console.error(`Missing error code page: /error-codes/${code}`);
	if (badLinks.length || missingCodes.length) {
		process.exitCode = 1;
		return;
	}
	console.log(
		`docs links OK: ${linkCount} links in ${files.length} files, ${codes.length} error codes`
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
