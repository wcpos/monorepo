// Pins patches/react-native-esc-pos-printer@4.5.1.patch: on iOS (new
// architecture) the TurboModule codegen invokes ObjC selectors by name, so
// every `@selector(...)` in the generated spec must be exported, label for
// label, by an `RCT_EXPORT_METHOD` in the library's ios/*.mm. A missing one is
// a fatal `unrecognized selector` crash the first time JS calls the method
// (POS-310: the codegen calls `addCommand:data:`, upstream 4.5.1 exports
// `addCommand:base64string:`, and the patch relabels it).
// If this fails after a library bump, check whether upstream fixed the
// export labels; port or drop the patch, never delete this test.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

// ESC_POS_PRINTER_DIR exists only for the mutation check: point it at an
// unpacked (unpatched) copy of the package to prove this test fails there.
const pkgDir =
	process.env.ESC_POS_PRINTER_DIR ??
	dirname(
		createRequire(new URL('../apps/main/package.json', import.meta.url)).resolve(
			'react-native-esc-pos-printer/package.json'
		)
	);

// Codegen selectors that need no RCT_EXPORT_METHOD here.
const ALLOWED_MISSING = new Set([
	// Android-only discovery helper; WCPOS never calls it, and 4.5.1 exports no iOS method for it.
	'enableLocationSetting:reject:',
	// Served by the module's constants path (constantsToExport), not an exported method.
	'getConstants',
]);

function codegenSelectors() {
	const spec = readFileSync(
		join(pkgDir, 'ios/generated/RNEscPosPrinterSpec/RNEscPosPrinterSpec-generated.mm'),
		'utf8'
	);
	return new Set([...spec.matchAll(/@selector\(([^)]*)\)/g)].map((m) => m[1]));
}

function exportedSelectors() {
	const iosDir = join(pkgDir, 'ios');
	const exported = new Set();
	for (const file of readdirSync(iosDir).filter((f) => f.endsWith('.mm'))) {
		const source = readFileSync(join(iosDir, file), 'utf8');
		// From the `(` after RCT_EXPORT_METHOD to the `)` before the method's `{`.
		for (const [, block] of source.matchAll(/RCT_EXPORT_METHOD\(([\s\S]*?)\)\s*\{/g)) {
			const withoutCasts = block.replace(/\([^()]*\)/g, '');
			const labels = [...withoutCasts.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
			exported.add(labels.map((l) => `${l}:`).join(''));
		}
	}
	return exported;
}

test('every codegen selector is exported by RCT_EXPORT_METHOD', () => {
	const exported = exportedSelectors();
	const missing = [...codegenSelectors()].filter(
		(s) => !exported.has(s) && !ALLOWED_MISSING.has(s)
	);
	assert.deepEqual(
		missing,
		[],
		`codegen selectors with no RCT_EXPORT_METHOD: ${missing.join(', ')}`
	);
});

test('addCommand:data:resolve:reject: is exported (POS-310)', () => {
	assert.ok(
		exportedSelectors().has('addCommand:data:resolve:reject:'),
		'POS-310: addCommand:data:resolve:reject: is not exported; printer.addCommand() crashes iOS with an unrecognized selector'
	);
});
