const { createRunOncePlugin, withGradleProperties } = require('@expo/config-plugins');

const pkg = 'with-wcpos-dev-gradle-workers';

// EAS's medium Android worker (4 vCPU, 16 GB) cannot hold the SDK 58 /
// React Native 0.88 native compile when Gradle builds modules in parallel.
// The builder itself passes `-Dorg.gradle.parallel=true` in GRADLE_OPTS, so
// up to `org.gradle.workers.max` (default: the CPU count) modules run their
// CMake builds at once, and every one of them spawns a full-width ninja.
// EAS build ace57765 (2026-09-30, two ABIs, 24 minutes in) had the CMake
// builds of seven modules interleaved (nitro-modules, worklets, skia,
// expo-modules-core, reanimated, expo-updates, app) when the kernel killed
// the daemon; the four-ABI attempt 8c72b2ba (2026-09-28, #2235) died at the
// same spot, so the ABI cut alone was not enough.
// The daemon "disappearing" rather than throwing OutOfMemoryError (the JVM
// runs with -XX:+HeapDumpOnOutOfMemoryError) is the kernel OOM killer, not a
// heap limit.
//
// A `-D` in GRADLE_OPTS is a JVM system property and outranks the project's
// gradle.properties, so `org.gradle.parallel=false` here would be ignored.
// `org.gradle.workers.max` is NOT set by the builder, so the project's value
// stands: one worker means one module's ninja at a time, which is roughly a
// quarter of the C++ peak that died. Ninja still uses every core inside that
// module, so the C++ phase — the bulk of the wall-clock — is barely slower;
// only the Java/Kotlin phases lose their overlap. The Starter plan's build
// timeout is two hours, so the trade is safe.
//
// Only the `development` profile includes this plugin (app.config.ts): store
// and adhoc builds are rarer and a larger worker is a separate spend
// decision. If a green dev build later proves comfortable, 2 is the next
// value to try, not the default.
const GRADLE_WORKERS_MAX = 1;

const WORKERS_MAX_KEY = 'org.gradle.workers.max';
const WORKERS_MAX_COMMENT =
	'Dev-client builds: one Gradle worker so a single module compiles C++ at a time (with-dev-gradle-workers.js).';

function setGradleWorkersMax(properties) {
	const next = properties.filter(
		(item) =>
			!(item.type === 'property' && item.key === WORKERS_MAX_KEY) &&
			!(item.type === 'comment' && item.value === WORKERS_MAX_COMMENT)
	);
	next.push({ type: 'comment', value: WORKERS_MAX_COMMENT });
	next.push({ type: 'property', key: WORKERS_MAX_KEY, value: String(GRADLE_WORKERS_MAX) });
	return next;
}

const withDevGradleWorkers = (config) =>
	withGradleProperties(config, (config) => {
		config.modResults = setGradleWorkersMax(config.modResults);
		return config;
	});

module.exports = createRunOncePlugin(withDevGradleWorkers, pkg, '0.1.0');
module.exports.GRADLE_WORKERS_MAX = GRADLE_WORKERS_MAX;
module.exports.WORKERS_MAX_KEY = WORKERS_MAX_KEY;
module.exports.setGradleWorkersMax = setGradleWorkersMax;
