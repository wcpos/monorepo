import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const source = readFileSync(
	join(
		dirname(require.resolve('expo-modules-core/package.json')),
		'android/src/main/java/expo/modules/kotlin/sharedobjects/SharedObjectRegistry.kt'
	),
	'utf8'
);

// Exact SDK patch tripwire: all map reads and released-id validation must use
// the writers' registry monitor, not the SharedObjectId extension receiver.
for (const [signature, monitor, read] of [
	['internal fun toNativeObject(id: SharedObjectId)', 'this', 'pairs[id.ensureWasNotRelease()]'],
	['internal fun toNativeObjectOrNull(js: JavaScriptObject)', 'this', 'pairs[id]'],
	[
		'private fun SharedObjectId.ensureWasNotRelease()',
		'this@SharedObjectRegistry',
		'pairs.contains(this)',
	],
]) {
	test(`${signature} holds the registry monitor across the read`, () => {
		const start = source.indexOf(signature);
		assert.notEqual(start, -1, 'SDK method anchor moved');
		const open = source.indexOf('{', start);
		let depth = 1;
		let end = open + 1;
		while (depth && end < source.length) {
			if (source[end] === '{') depth++;
			if (source[end] === '}') depth--;
			end++;
		}
		const body = source.slice(open + 1, end - 1);
		const lock = body.indexOf(`synchronized(${monitor}) {`);
		assert.notEqual(lock, -1, 'missing registry monitor');
		const readAt = body.indexOf(read);
		assert.ok(readAt > lock, 'map read is outside the monitor');
		let lockDepth = 1;
		for (let i = body.indexOf('{', lock) + 1; i < readAt; i++) {
			if (body[i] === '{') lockDepth++;
			if (body[i] === '}') lockDepth--;
			assert.ok(lockDepth > 0, 'monitor released before map read');
		}
	});
}
