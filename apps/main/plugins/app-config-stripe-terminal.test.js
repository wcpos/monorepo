const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const mainDirectory = path.dirname(require.resolve('../package.json'));
// The CLI directly, not `pnpm exec`: pnpm writes its lockfile-sync warning to stdout,
// ahead of the JSON.
const expoCli = require.resolve('expo/bin/cli', { paths: [mainDirectory] });

const resolvedConfig = (easProfile) =>
	JSON.parse(
		execFileSync(process.execPath, [expoCli, 'config', '--json'], {
			cwd: mainDirectory,
			encoding: 'utf8',
			env: { ...process.env, EAS_BUILD_PROFILE: easProfile },
		})
	);

// Tap to Pay on Android depends on both options (roadmap#429); a plugin reorder or a
// config rewrite must not drop them silently.
test.describe('Stripe Terminal plugin carries the Tap to Pay on Android options', () => {
	for (const profile of ['development', 'production']) {
		test(`${profile}: appDelegate and tapToPayCheck are true`, () => {
			const entry = resolvedConfig(profile).plugins.find(
				(plugin) => Array.isArray(plugin) && plugin[0] === '@stripe/stripe-terminal-react-native'
			);
			assert.ok(entry, 'Stripe Terminal plugin entry (with props) not found');
			assert.equal(entry[1]?.appDelegate, true);
			assert.equal(entry[1]?.tapToPayCheck, true);
		});
	}
});
