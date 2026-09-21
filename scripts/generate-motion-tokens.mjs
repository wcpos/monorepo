import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

export const sheetPath = fileURLToPath(new URL('../apps/main/global.css', import.meta.url));
const motionPath = new URL('../packages/components/src/lib/motion.ts', import.meta.url);

export function loadMotion() {
	// Execute the trusted local data module without loading React Native in Node.
	// The same bezier arguments become CSS instead of a Reanimated easing function.
	const exports = {};
	const { outputText } = ts.transpileModule(readFileSync(motionPath, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	});
	runInNewContext(outputText, {
		exports,
		require: () => ({ Easing: { bezier: (...points) => `cubic-bezier(${points.join(', ')})` } }),
	});
	return exports;
}

export function generateSheet(sheet) {
	const motion = loadMotion();
	const declarations = Object.entries(motion)
		.filter(([name, value]) => typeof value === 'number' && !name.endsWith('_MS'))
		.map(([name, value]) => `  --duration-${name.toLowerCase().replaceAll('_', '-')}: ${value}ms;`);
	declarations.push(`  --ease-standard: ${motion.EASE};`, `  --ease-beat: ${motion.EASE_BEAT};`);
	for (const [name, value] of Object.entries(motion.WEB_ANIMATIONS)) {
		declarations.push(`  --animate-${name}: ${value};`);
	}
	const block = /  \/\* motion:start \*\/[\s\S]*?  \/\* motion:end \*\//;
	if (!block.test(sheet)) throw new Error('Missing motion markers in global.css');
	return sheet.replace(
		block,
		`  /* motion:start */\n${declarations.join('\n')}\n  /* motion:end */`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	writeFileSync(sheetPath, generateSheet(readFileSync(sheetPath, 'utf8')));
}
