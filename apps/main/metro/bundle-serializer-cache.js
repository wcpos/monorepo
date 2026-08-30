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
// entry). Bounded so a few platform/option variants cannot pin more than a
// handful of 29 MB strings.

const MAX_CACHED_BUNDLES = 4;

function optionsKey(entryPoint, options) {
	return JSON.stringify([entryPoint, options], (_key, value) =>
		typeof value === 'function' ? undefined : value
	);
}

function fingerprint(preModules, graph) {
	const modules = new Array(graph.dependencies.size);
	let i = 0;
	for (const module of graph.dependencies.values()) {
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
 * Wrap `config.serializer.customSerializer` with a per-graph output cache.
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
	// graph -> Map<optionsKey, { fingerprint, result, size }>, insertion-ordered for eviction.
	const cache = new WeakMap();

	config.serializer.customSerializer = async (entryPoint, preModules, graph, options) => {
		const key = optionsKey(entryPoint, options);
		const current = fingerprint(preModules, graph);
		let perGraph = cache.get(graph);
		const hit = perGraph && perGraph.get(key);
		if (hit && sameFingerprint(hit.fingerprint, current)) {
			log(`[bundle-cache] hit (${hit.size} bytes)`);
			return hit.result;
		}
		const startedAt = Date.now();
		const result = await baseSerializer(entryPoint, preModules, graph, options);
		const size = resultSize(result);
		if (!perGraph) {
			perGraph = new Map();
			cache.set(graph, perGraph);
		}
		perGraph.delete(key);
		while (perGraph.size >= MAX_CACHED_BUNDLES) {
			perGraph.delete(perGraph.keys().next().value);
		}
		perGraph.set(key, { fingerprint: current, result, size });
		log(`[bundle-cache] miss: serialised ${size} bytes in ${Date.now() - startedAt}ms`);
		return result;
	};
	return config;
}

module.exports = { withBundleSerializerCache, MAX_CACHED_BUNDLES };
