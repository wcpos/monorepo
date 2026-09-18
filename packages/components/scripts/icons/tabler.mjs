// Source: npm pack @tabler/icons@3.46.0 in /tmp, then extract the tarball.
// Usage: node packages/components/scripts/icons/tabler.mjs /tmp/tabler/package
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Pass the extracted @tabler/icons package directory');
const map = JSON.parse(await readFile(new URL('./tabler-map.json', import.meta.url), 'utf8'));
const target = new URL('../../src/icon/svg/tabler/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [name, tabler] of Object.entries(map)) {
	const svg = await readFile(resolve(source, 'icons/outline', `${tabler}.svg`), 'utf8');
	await writeFile(
		new URL(`${name}.svg`, target),
		svg.replaceAll('stroke-width="2"', 'stroke-width="1.5"')
	);
}
await copyFile(resolve(source, 'LICENSE'), new URL('LICENSE', target));
