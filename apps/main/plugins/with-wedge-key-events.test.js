const assert = require('node:assert/strict');
const test = require('node:test');

const { addDispatchOverride, addImports } = require('./with-wedge-key-events');

const sampleMainActivity = `package com.wcpos.main

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "main"
}
`;

test('adds the KeyEvent and dispatcher imports after the package declaration', () => {
	const result = addImports(sampleMainActivity);
	assert.ok(result.includes('import android.view.KeyEvent'));
	assert.ok(result.includes('import expo.modules.wedgekeyevents.WedgeKeyDispatcher'));
	assert.ok(
		result.indexOf('package com.wcpos.main') < result.indexOf('import android.view.KeyEvent')
	);
});

test('is idempotent for imports', () => {
	const once = addImports(sampleMainActivity);
	assert.equal(addImports(once), once);
});

test('injects the dispatchKeyEvent override inside the MainActivity class', () => {
	const result = addDispatchOverride(sampleMainActivity);
	assert.ok(result.includes('override fun dispatchKeyEvent(event: KeyEvent): Boolean'));
	assert.ok(result.includes('WedgeKeyDispatcher.handleKeyEvent(event)'));
	assert.ok(result.indexOf('class MainActivity') < result.indexOf('dispatchKeyEvent'));
});

test('is idempotent for the override', () => {
	const once = addDispatchOverride(sampleMainActivity);
	assert.equal(addDispatchOverride(once), once);
});

test('throws on a non-matching MainActivity shape', () => {
	assert.throws(() => addDispatchOverride('class SomethingElse {}'));
});
