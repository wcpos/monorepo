import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

function ownerOf(source) {
	const normalized = `/${source.replaceAll('\\', '/')}`;
	const dependency = normalized.lastIndexOf('/node_modules/');
	if (dependency !== -1) {
		return normalized.slice(dependency + 1).match(/^node_modules\/(?:@[^/]+\/)?[^/]+/)[0];
	}
	return normalized.match(/\/(packages\/[^/]+|apps\/main\/[^/]+)\//)?.[1] ?? '<unmapped>';
}

function main() {
	if (process.argv.length !== 3) {
		throw new Error('Usage: node scripts/web-bundle-composition.mjs <export-dir>');
	}
	const directory = path.resolve(process.argv[2]);
	// The eager set is Metro's fixed trio, in load order: the module-system runtime, the
	// shared chunk hoisted from every lazy chunk (absent when nothing is shared), and the
	// entry. Taking them by name avoids parsing index.html.
	const chunkDirectory = '_expo/static/js/web';
	const jsFiles = readdirSync(path.join(directory, chunkDirectory)).filter((name) => name.endsWith('.js'));
	const eager = ['__expo-metro-runtime-', '__common-', 'entry-']
		.map((prefix) => jsFiles.find((name) => name.startsWith(prefix)))
		.filter(Boolean)
		.map((name) => `${chunkDirectory}/${name}`);
	if (!eager.some((name) => name.includes('/entry-'))) throw new Error('No entry-*.js chunk found');
	const owners = new Map();
	const subtotals = [];
	for (const name of eager) {
		const bundle = path.join(directory, name);
		const output = execFileSync('npx', [
			'--yes', '--cache', path.join(directory, '.npm-cache'), 'source-map-explorer',
			bundle, `${bundle}.map`, '--json', '--no-root', '--no-border-checks',
		], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
		const { results } = JSON.parse(output);
		const result = results[0];
		for (const [source, { size }] of Object.entries(result.files)) {
			const owner = ownerOf(source);
			owners.set(owner, (owners.get(owner) ?? 0) + size);
		}
		subtotals.push({ name, bytes: result.totalBytes });
	}
	const total = subtotals.reduce((sum, script) => sum + script.bytes, 0);
	const lines = [
		'# Web bundle composition', '',
		'## Eager owners (top 50)', '',
		'Bytes are source-map-explorer raw attribution; percentages use the entire eager set.',
		'`<unmapped>` includes unknown owners, generated code, EOLs and source-map comments.', '',
		'| Owner | Bytes | Percent | Cumulative percent |',
		'| --- | ---: | ---: | ---: |',
	];
	let cumulative = 0;
	for (const [owner, bytes] of [...owners].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 50)) {
		cumulative += bytes;
		lines.push(`| \`${owner}\` | ${bytes} | ${(100 * bytes / total).toFixed(2)}% | ${(100 * cumulative / total).toFixed(2)}% |`);
	}
	lines.push('', 'Eager script subtotals (document order):', '');
	for (const { name, bytes } of subtotals) lines.push(`- \`${name}\`: ${bytes} bytes`);
	lines.push('', '## All web JS chunks', '',
		'Brotli quality 11; each file compressed separately. Sizes are bytes.', '',
		'| Chunk | Eager | Raw bytes | Brotli bytes |', '| --- | :---: | ---: | ---: |');
	const chunks = [...jsFiles].sort();
	let eagerRaw = 0;
	let eagerBrotli = 0;
	for (const name of chunks) {
		const relative = `${chunkDirectory}/${name}`;
		const content = readFileSync(path.join(directory, relative));
		const compressed = brotliCompressSync(content, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).length;
		const isEager = eager.includes(relative);
		lines.push(`| \`${name}\` | ${isEager ? 'yes' : ''} | ${content.length} | ${compressed} |`);
		if (isEager) {
			eagerRaw += content.length;
			eagerBrotli += compressed;
		}
	}
	lines.push('', `**Eager total: ${eagerRaw} raw bytes; ${eagerBrotli} brotli bytes.**`, '');
	const markdown = lines.join('\n');
	writeFileSync(path.join(directory, 'composition.md'), markdown);
	process.stdout.write(markdown);
}

try {
	main();
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
