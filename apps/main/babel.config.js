module.exports = function (api) {
	api.cache(true);
	return {
		presets: ['babel-preset-expo'],
		plugins: [
			[
				'react-native-worklets/plugin',
				{
					bundleMode: true,
					strictGlobal: true,
					importForwarding: {
						moduleNames: [
							'rxdb',
							'rxjs',
							'rxdb/plugins/core',
							'rxdb/plugins/storage-remote',
							'rxdb/plugins/utils',
							'rxdb-premium/plugins/storage-abstract-filesystem',
							'rxdb-premium/plugins/shared',
							'@wcpos/rxdb-storage-worklet',
							'@wcpos/worklet-opfs',
							'@wcpos/react-native-worklet-fs',
							'@wcpos/database/plugins/opfs-targeted-recovery.mjs',
						],
						// Only the worker initializer's local imports; never the database barrel
						// (it reaches React Native). Recovery itself imports only rxdb/plugins/core.
						relativePaths: ['packages/database/src/adapters/storage'],
					},
				},
			],
		],
		env: {
			production: {
				plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
			},
		},
	};
};
