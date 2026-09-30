const assert = require('node:assert/strict');
const test = require('node:test');

const {
	GRADLE_WORKERS_MAX,
	WORKERS_MAX_KEY,
	setGradleWorkersMax,
} = require('./with-dev-gradle-workers');

const property = (key, value) => ({ type: 'property', key, value });

// The value is the whole point: one worker is what keeps the SDK 58 native
// compile inside EAS's 16 GB medium Android worker (build ace57765 died with
// the default). Raising it is a deliberate change with a green build behind
// it, not a drive-by.
test('caps Gradle at one worker on dev-client builds', () => {
	assert.equal(GRADLE_WORKERS_MAX, 1);
	assert.equal(WORKERS_MAX_KEY, 'org.gradle.workers.max');
});

test('appends the property and keeps the template entries', () => {
	const result = setGradleWorkersMax([
		property('org.gradle.jvmargs', '-Xmx2048m'),
		property('reactNativeArchitectures', 'arm64-v8a,x86_64'),
	]);
	const properties = result.filter((item) => item.type === 'property');
	assert.deepEqual(
		properties.map((item) => [item.key, item.value]),
		[
			['org.gradle.jvmargs', '-Xmx2048m'],
			['reactNativeArchitectures', 'arm64-v8a,x86_64'],
			['org.gradle.workers.max', '1'],
		]
	);
});

test('is idempotent and replaces a pre-existing value instead of duplicating it', () => {
	const twice = setGradleWorkersMax(
		setGradleWorkersMax([property('org.gradle.workers.max', '4'), property('other', 'keep')])
	);
	const workers = twice.filter(
		(item) => item.type === 'property' && item.key === 'org.gradle.workers.max'
	);
	assert.equal(workers.length, 1);
	assert.equal(workers[0].value, '1');
	assert.ok(twice.some((item) => item.type === 'property' && item.key === 'other'));
});
