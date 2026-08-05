import { spawnSync } from 'node:child_process';
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
	it('resolves the root entry identically through Node exports and Metro', () => {
		const nodeResolved = requireFromMain.resolve('@wcpos/query');
		const metroResolved = metroResolve(metroContext, path.join(querySourceRoot, 'index'), 'ios');

		expect(metroResolved).toEqual({
			type: 'sourceFile',
			filePath: fs.realpathSync(nodeResolved),
		});
	});

	it('resolves the collection-map subpath identically through Node exports and Metro', () => {
		const nodeResolved = requireFromMain.resolve('@wcpos/query/collection-map');
		const metroResolved = metroResolve(
			metroContext,
			path.join(querySourceRoot, 'collection-map'),
			'ios'
		);

		expect(metroResolved).toEqual({
			type: 'sourceFile',
			filePath: fs.realpathSync(nodeResolved),
		});
	});

	it('rejects the removed query subpaths', () => {
		for (const specifier of ['@wcpos/query/engine-compat', '@wcpos/query/requirements']) {
			const resolution = spawnSync(
				process.execPath,
				['-e', `require.resolve(${JSON.stringify(specifier)})`],
				{
					cwd: path.join(repoRoot, 'apps/main'),
					encoding: 'utf8',
				}
			);

			expect(resolution.status).toBe(1);
			expect(resolution.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
		}
	});
});
