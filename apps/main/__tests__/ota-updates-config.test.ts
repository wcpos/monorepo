// This pins the OTA lane's contract; flipping any of these silently returns
// mobile to store-build-only delivery.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SourceSkips } from '@expo/fingerprint';
import { normalizeSourceSkips } from '@expo/fingerprint/build/Config';
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

	it('resolves and exports the platform runtime before every E2E Metro start', () => {
		const workflow = parse(
			readFileSync(resolve(__dirname, '../../../.github/workflows/e2e-native.yml'), 'utf8')
		);
		const starts = Object.entries(
			workflow.jobs as Record<string, { steps: { run?: string }[] }>
		).flatMap(([platform, job]) =>
			job.steps.flatMap(({ run = '' }) =>
				Array.from(run.matchAll(/\bexpo start\b/g), (match) => ({
					platform,
					before: run.slice(0, match.index),
				}))
			)
		);
		expect(starts).toHaveLength(2);
		for (const { platform, before } of starts) {
			expect(['android', 'ios']).toContain(platform);
			expect(before).toMatch(
				new RegExp(
					`^WCPOS_E2E_RUNTIME_VERSION=.*runtimeversion:resolve --platform ${platform}\\b`,
					'm'
				)
			);
			expect(before).toMatch(/^export WCPOS_E2E_RUNTIME_VERSION\s*$/m);
		}
	});

	it('uses the native fingerprint as the runtime version', () => {
		expect(appConfig.runtimeVersion).toEqual({ policy: 'fingerprint' });
	});

	it('excludes only version fields from the native fingerprint', () => {
		const configPath = resolve(__dirname, '../fingerprint.config.js');
		expect(existsSync(configPath)).toBe(true);
		const fingerprintConfig = require(configPath);
		expect(fingerprintConfig).toHaveProperty('sourceSkips');
		expect(normalizeSourceSkips(fingerprintConfig.sourceSkips)).toBe(SourceSkips.ExpoConfigVersions);
	});

	it('reuses the resolved runtime only in the E2E Metro process', () => {
		// Use Expo's config loader, not Jest's app transform (which inlines EXPO_PUBLIC_*).
		for (const [e2e, runtime, expected] of [
			['1', 'resolved-native-fingerprint', 'resolved-native-fingerprint'],
			['', 'resolved-native-fingerprint', { policy: 'fingerprint' }],
			['1', '', { policy: 'fingerprint' }],
		]) {
			const result = spawnSync(
				process.execPath,
				[
					'-e',
					'process.stdout.write(JSON.stringify(require("expo/config").getConfig(process.cwd()).exp.runtimeVersion))',
				],
				{
					cwd: resolve(__dirname, '..'),
					encoding: 'utf8',
					env: {
						...process.env,
						EXPO_PUBLIC_WCPOS_E2E: String(e2e),
						WCPOS_E2E_RUNTIME_VERSION: String(runtime),
					},
				}
			);
			expect(result.status).toBe(0);
			expect(JSON.parse(result.stdout)).toEqual(expected);
		}
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