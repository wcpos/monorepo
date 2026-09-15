// This pins the OTA lane's contract; flipping any of these silently returns
// mobile to store-build-only delivery.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

jest.resetModules();

const appConfig = require('../app.config').default({ config: {} });
const eas = require('../eas.json');
const packageJson = require('../package.json');

describe('mobile OTA configuration', () => {
	it.each([
		['e2e-native.yml', 'development', 1],
		['build.yml', '${{ github.event.inputs.profile }}', 2],
	])('supplies the selected profile to every EAS build caller in %s', (file, profile, count) => {
		const workflow = parse(
			readFileSync(resolve(__dirname, '../../../.github/workflows', file), 'utf8')
		);
		const steps = Object.values(
			workflow.jobs as Record<
				string,
				{
					steps: { run?: string; env?: Record<string, string> }[];
				}
			>
		)
			.flatMap((job) => job.steps)
			.filter((step) => /\beas build\s/.test(step.run ?? ''));
		expect(steps).toHaveLength(count);
		for (const step of steps) {
			expect(step.env?.EAS_BUILD_PROFILE).toBe(profile);
		}
	});

	it('uses the native fingerprint as the runtime version', () => {
		expect(appConfig.runtimeVersion).toEqual({ policy: 'fingerprint' });
	});

	it('fetches updates from the existing EAS project', () => {
		expect(appConfig.updates?.url).toBe(`https://u.expo.dev/${appConfig.extra.eas.projectId}`);
	});

	it('checks on load without delaying POS startup', () => {
		expect(appConfig.updates?.checkAutomatically).toBe('ON_LOAD');
		expect(appConfig.updates?.fallbackToCacheTimeout).toBe(0);
	});

	it('routes release builds to their channels but leaves dev clients on Metro', () => {
		expect(eas.build.production.channel).toBe('production');
		expect(eas.build.adhoc.channel).toBe('adhoc');
		expect(eas.build.development).not.toHaveProperty('channel');
	});

	it('includes the native updater dependency', () => {
		expect(packageJson.dependencies).toHaveProperty('expo-updates');
	});
});
