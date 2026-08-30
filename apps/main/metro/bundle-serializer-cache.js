// Serve an UNCHANGED bundle from memory instead of re-serialising it.
//
// Metro's bundle request path (metro/src/Server.js `_processBundleRequest.build`)
// runs the serializer on every request, even when the delta since the last
// build is empty: the graph is walked and the whole bundle string is rebuilt
// each time. Measured on this app (6.7k modules, 29 MB): 0.6–2 s per request
// on an M-series Mac, 10–68 s on the 3-core GitHub macOS runner during the
// native E2E suite, where the dev client gives the bundle 60 s before it shows
// "Could not connect to development server" (e2e-native run 33287230684,
// iOS tablet flow 04). Every `stopApp`/`launchApp` in a Maestro flow pays it.
//
// Invalidation reads the graph itself, not the file watcher: Metro replaces a
// module's object in `graph.dependencies` whenever it re-transforms that file
// (metro/src/DeltaBundler/Graph.js `_processModule`) and adds/removes keys for
// added/deleted files, so the identity of every entry — plus `preModules` —
// is exactly what the serializer's output depends on. The watcher is NOT a
// usable signal: the dev client's manifest request rewrites
// `.expo/devices.json` on every launch, which fires a change event without
// touching the graph, and that is the very request this cache exists for.
//
// Keyed by graph identity + the serializer's non-function options (which
// embed the request's sourceUrl, so a different query string is a different
// entry) + public environment values in development. A global LRU bounds the
// number of 29 MB strings across all platform/entry-point graphs.

const MAX_CACHED_BUNDLES = 4;

function optionsKey(entryPoint, options) {
	const publicEnv = options.dev
		? Object.keys(process.env)
				.filter((key) => key.startsWith('EXPO_PUBLIC_'))
				.sort()
				.map((key) => [key, process.env[key]])
		: null;
	return JSON.stringify([entryPoint, options, publicEnv], (_key, value) =>
		typeof value === 'function' ? undefined : value
	);
}

function fingerprint(preModules, graph) {
	const modules = new Array(graph.dependencies.size * 2);
	let i = 0;
	for (const [key, module] of graph.dependencies) {
		modules[i++] = key;
		modules[i++] = module;
	}
	return { preModules: Array.from(preModules), modules };
}

function sameModules(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function sameFingerprint(a, b) {
	return sameModules(a.preModules, b.preModules) && sameModules(a.modules, b.modules);
}

function resultSize(result) {
	if (typeof result === 'string') return result.length;
	if (result && typeof result.code === 'string') return result.code.length;
	return 0;
}

/**
 * Wrap `config.serializer.customSerializer` with a bounded output cache.
 *
 * @param {object} config Metro config whose `serializer.customSerializer` is set.
 * @param {{ log?: (line: string) => void }} [hooks]
 * @returns {object} the same config, mutated.
 */
function withBundleSerializerCache(config, { log = console.log } = {}) {
	const baseSerializer = config.serializer.customSerializer;
	if (typeof baseSerializer !== 'function') {
		throw new Error(
			'withBundleSerializerCache: config.serializer.customSerializer must be set first'
		);
	}
	// { graph, key, fingerprint, result, size }[], least recently used first.
	const cache = [];

	config.serializer.customSerializer = async (entryPoint, preModules, graph, options) => {
		const key = optionsKey(entryPoint, options);
		const current = fingerprint(preModules, graph);
		const hitIndex = cache.findIndex((entry) => entry.graph === graph && entry.key === key);
		const hit = cache[hitIndex];
		if (hit && sameFingerprint(hit.fingerprint, current)) {
			cache.splice(hitIndex, 1);
			cache.push(hit);
			log(`[bundle-cache] hit (${hit.size} bytes)`);
			return hit.result;
		}
		const startedAt = Date.now();
		const result = await baseSerializer(entryPoint, preModules, graph, options);
		const size = resultSize(result);
		const staleIndex = cache.findIndex((entry) => entry.graph === graph && entry.key === key);
		if (staleIndex !== -1) cache.splice(staleIndex, 1);
		while (cache.length >= MAX_CACHED_BUNDLES) {
			cache.shift();
		}
		cache.push({ graph, key, fingerprint: current, result, size });
		log(`[bundle-cache] miss: serialised ${size} bytes in ${Date.now() - startedAt}ms`);
		return result;
	};
	return config;
}

module.exports = { withBundleSerializerCache, MAX_CACHED_BUNDLES };
