import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function fixDistEsmSpecifiers(distDir) {
	const result = { files: 0, rewritten: 0 };
	function walk(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) {
				walk(file);
				continue;
			}
			if (!/\.(?:js|d\.ts)$/.test(entry.name)) continue;
			result.files++;
			const source = readFileSync(file, 'utf8');
			const rewritten = source.replace(
				/\b(import\s*(?:\(\s*)?|(?:import|export)\s+(?:[^'";]*?\s+)?from\s*)(['"])(\.{1,2}\/[^'"\r\n]+)\2/g,
				(match, prefix, quote, specifier, offset) => {
					if (/\.(?:js|mjs|cjs)$/.test(specifier)) return match;
					if (specifier.endsWith('.json')) {
						if (file.endsWith('.d.ts')) return match;
						if (/^import\s*\(/.test(prefix)) {
							throw new Error(`${file}: dynamic JSON import ${specifier}`);
						}
						const hasAttribute = /^\s*(?:with|assert)\s*\{/.test(source.slice(offset + match.length));
						return prefix.startsWith('import') && !hasAttribute
							? `${match} with { type: 'json' }` : match;
					}
					const target = resolve(dirname(file), specifier);
					const suffix = existsSync(`${target}.js`) ? '.js'
						: existsSync(join(target, 'index.js')) ? '/index.js' : null;
					if (!suffix) throw new Error(`${file}: unresolved relative specifier ${specifier}`);
					return `${prefix}${quote}${specifier}${suffix}${quote}`;
				}
			);
			if (rewritten !== source) {
				writeFileSync(file, rewritten);
				result.rewritten++;
			}
		}
	}
	walk(distDir);
	return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const result = fixDistEsmSpecifiers(process.argv[2]);
	console.log(`fix-dist-esm-specifiers: ${result.rewritten}/${result.files} files rewritten`);
}
