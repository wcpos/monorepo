const { createRunOncePlugin, withMainActivity } = require('@expo/config-plugins');

const pkg = 'with-wcpos-wedge-key-events';

const IMPORT_KEYEVENT = 'import android.view.KeyEvent';
const IMPORT_DISPATCHER = 'import expo.modules.wedgekeyevents.WedgeKeyDispatcher';

const DISPATCH_OVERRIDE = [
	'',
	'  override fun dispatchKeyEvent(event: KeyEvent): Boolean {',
	'    // Attributed barcode scanners: swallow keys from registered devices so',
	'    // scanner input never reaches focused fields (with-wedge-key-events).',
	'    if (WedgeKeyDispatcher.handleKeyEvent(event)) {',
	'      return true',
	'    }',
	'    return super.dispatchKeyEvent(event)',
	'  }',
].join('\n');

function addImports(mainActivity) {
	let contents = mainActivity;
	for (const importLine of [IMPORT_KEYEVENT, IMPORT_DISPATCHER]) {
		if (!contents.includes(importLine)) {
			// Insert after the package declaration, before existing imports.
			const packageMatch = contents.match(/^package .+$/m);
			if (!packageMatch) {
				throw new Error(
					'with-wcpos-wedge-key-events: could not find package declaration in MainActivity'
				);
			}
			contents = contents.replace(packageMatch[0], `${packageMatch[0]}\n\n${importLine}`);
		}
	}
	return contents;
}

function addDispatchOverride(mainActivity) {
	if (mainActivity.includes('fun dispatchKeyEvent(')) {
		return mainActivity;
	}
	const classPattern = /class MainActivity\s*:\s*ReactActivity\(\)\s*{/;
	if (!classPattern.test(mainActivity)) {
		throw new Error('with-wcpos-wedge-key-events: could not find MainActivity class declaration');
	}
	return mainActivity.replace(classPattern, (match) => `${match}${DISPATCH_OVERRIDE}`);
}

const withWedgeKeyEvents = (config) =>
	withMainActivity(config, (config) => {
		if (config.modResults.language !== 'kt') {
			throw new Error('with-wcpos-wedge-key-events requires a Kotlin MainActivity');
		}
		config.modResults.contents = addDispatchOverride(addImports(config.modResults.contents));
		return config;
	});

module.exports = createRunOncePlugin(withWedgeKeyEvents, pkg, '0.1.0');
module.exports.addImports = addImports;
module.exports.addDispatchOverride = addDispatchOverride;
