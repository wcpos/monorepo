import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { resolve as metroResolve, type ResolutionContext } from 'metro-resolver';

const repoRoot = path.resolve(__dirname, '../../..');
const querySourceRoot = path.join(repoRoot, 'packages/query/src');
const requireFromMain = createRequire(path.join(repoRoot, 'apps/main/package.json'));

const fileSystemLookup: ResolutionContext['fileSystemLookup'] = (candidate) => {
	try {
		const stat = fs.statSync(candidate);
		return {
			exists: true,
			type: stat.isDirectory() ? 'd' : 'f',
			realPath: fs.realpathSync(candidate),
		};
	} catch {
		return { exists: false };
	}
};

const metroContext: ResolutionContext = {
	allowHaste: false,
	assetExts: new Set(),
	customResolverOptions: {},
	dev: false,
	disableHierarchicalLookup: false,
	doesFileExist: (candidate) => fileSystemLookup(candidate).exists,
	extraNodeModules: null,
	fileSystemLookup,
	getPackage: (packageJsonPath) =>
		JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>,
	getPackageForModule: () => null,
	mainFields: ['react-native', 'browser', 'main'],
	nodeModulesPaths: [path.join(repoRoot, 'node_modules')],
	originModulePath: path.join(
		repoRoot,
		'packages/core/src/screens/main/pos/contexts/current-order/use-open-orders-resource.ts'
	),
	preferNativePlatform: true,
	redirectModulePath: (modulePath) => modulePath,
	resolveAsset: () => null,
	resolveHasteModule: () => null,
	resolveHastePackage: () => null,
	sourceExts: ['ts', 'tsx', 'js', 'jsx', 'json'],
	unstable_conditionNames: [],
	unstable_conditionsByPlatform: {},
	unstable_enablePackageExports: true,
	unstable_incrementalResolution: false,
	unstable_logWarning: () => undefined,
};

describe('package exports', () => {
	it.each(['engine-compat', 'requirements'])(
		'resolves %s to the same source through Node exports and the Metro workspace resolver',
		(subpath) => {
			const nodeResolved = requireFromMain.resolve(`@wcpos/query/${subpath}`);
			const metroResolved = metroResolve(metroContext, path.join(querySourceRoot, subpath), 'ios');

			expect(metroResolved).toEqual({
				type: 'sourceFile',
				filePath: fs.realpathSync(nodeResolved),
			});
		}
	);
});
