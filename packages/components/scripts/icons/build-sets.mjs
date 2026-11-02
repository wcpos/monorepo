import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const readJSON = async (url) => JSON.parse(await readFile(url, 'utf8'));
const vocabulary = await readJSON(new URL('./vocabulary.json', import.meta.url));
// The three families that ship (Paul, 2026-10-30), pinned to an Iconify collection each.
const packages = {
	tabler: 'tabler@1.2.42',
	hugeicons: 'hugeicons@1.2.35',
	phosphor: 'ph@1.2.2',
};
const collections = {};
const metadata = {
	// Our own mark, drawn once in `./brand/` and borrowed by every family as `brand:wcpos`.
	brand: {
		description: 'WCPOS brand mark',
		license: 'WCPOS, all rights reserved',
		homepage: 'https://wcpos.com/',
	},
};
async function fetchJSON(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status}: ${url}`);
	return response.json();
}
for (const [family, pkg] of Object.entries(packages)) {
	const url = `https://cdn.jsdelivr.net/npm/@iconify-json/${pkg}/`;
	collections[family] = await fetchJSON(`${url}icons.json`);
	metadata[family] = await fetchJSON(`${url}package.json`);
}

async function sourceSVG(family, name) {
	if (family === 'brand') {
		return readFile(new URL(`./brand/${name}.svg`, import.meta.url), 'utf8');
	}
	const collection = collections[family];
	function iconData(key) {
		const alias = collection.aliases?.[key];
		return alias ? { ...iconData(alias.parent), ...alias } : collection.icons[key];
	}
	const icon = iconData(name);
	const box = [icon.left ?? 0, icon.top ?? 0, icon.width ?? collection.width, icon.height ?? collection.height];
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}">${icon.body}</svg>`;
}
const componentName = (name) => `Svg${name[0].toUpperCase()}${name.slice(1)}`;
const names = vocabulary.map(({ name, meaning }) => `\t'${name}', // ${meaning}`);
await writeFile(new URL('src/icon/names.ts', root), [
	"import type * as React from 'react';",
	"import type { SvgProps } from 'react-native-svg';",
	'',
	'// Generated from scripts/icons/vocabulary.json; do not edit.',
	'export const ICON_NAMES = [', ...names, '] as const;',
	'export type IconName = (typeof ICON_NAMES)[number];',
	'export type IconSet = Record<IconName, React.FC<SvgProps>>;',
	'',
].join('\n'));

for (const family of Object.keys(packages)) {
	const map = await readJSON(new URL(`./maps/${family}.json`, import.meta.url));
	const svgDir = new URL(`src/icon/svg/${family}/`, root);
	const componentDir = new URL(`src/icon/components/${family}/`, root);
	await rm(svgDir, { recursive: true, force: true });
	await rm(componentDir, { recursive: true, force: true });
	await mkdir(svgDir, { recursive: true });
	const sources = new Set([family]);
	for (const { name } of vocabulary) {
		const value = map[name];
		const [source, glyph] = value.includes(':') ? value.split(':') : [family, value];
		sources.add(source);
		let svg = await sourceSVG(source, glyph);
		// Tabler ships width-2 strokes; the app draws it at 1.5.
		if (family === 'tabler') svg = svg.replaceAll('stroke-width="2"', 'stroke-width="1.5"');
		const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
		await writeFile(new URL(`${kebab}.svg`, svgDir), svg);
	}
	const licences = [...sources].map((source) => {
		const { description, license, homepage } = metadata[source];
		return `- ${description}: ${license}. ${homepage}`;
	});
	if (family === 'tabler') licences.push('- Tabler strokes modified from width 2 to 1.5.');
	await writeFile(new URL('LICENSE.md', svgDir), `# ${family}\n\n${licences.join('\n')}\n`);
	// Phosphor is a filled family; Tabler and Hugeicons are strokes.
	const config = family === 'phosphor' ? 'svgr.config.js' : 'scripts/icons/svgr-stroke.cjs';
	execFileSync('svgr', ['--config-file', config, '--no-index', fileURLToPath(svgDir), '--out-dir', fileURLToPath(componentDir)], { cwd: root, stdio: 'inherit' });
	const imports = vocabulary.map(({ name }) => `import { ${componentName(name)} } from './${name}';`);
	const entries = vocabulary.map(({ name }) => `\t${name}: ${componentName(name)},`);
	await writeFile(new URL('index.ts', componentDir), [
		"import type { IconSet } from '../../names';", ...imports, '',
		'export const set = {', ...entries, '} satisfies IconSet;', '',
	].join('\n'));
}
execFileSync('eslint', ['src/icon/components', 'src/icon/names.ts', '--fix'], { cwd: root, stdio: 'inherit' });
