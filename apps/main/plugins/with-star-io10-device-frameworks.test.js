const assert = require('node:assert/strict');
const test = require('node:test');

const { patchPodfile } = require('./with-star-io10-device-frameworks');

const PODFILE = `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")

prepare_react_native_project!

target 'WCPOS' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
  end
end
`;

test('defines the fix before prepare_react_native_project! and calls it after react_native_post_install', () => {
	const patched = patchPodfile(PODFILE);
	const def = patched.indexOf('def fix_star_io10_device_framework_search_paths');
	const prepare = patched.indexOf('prepare_react_native_project!');
	const postInstall = patched.indexOf('react_native_post_install(');
	const call = patched.indexOf('    fix_star_io10_device_framework_search_paths(installer)');
	assert.ok(def > -1 && def < prepare);
	assert.ok(call > postInstall);
	assert.match(patched, /base_configuration_reference/);
	assert.match(patched, /FRAMEWORK_SEARCH_PATHS/);
});

test('is idempotent', () => {
	const once = patchPodfile(PODFILE);
	assert.equal(patchPodfile(once), once);
	assert.equal(once.match(/fix_star_io10_device_framework_search_paths/g).length, 2);
});

test('refuses a Podfile without a post_install block', () => {
	assert.throws(
		() => patchPodfile('prepare_react_native_project!\n'),
		/no react_native_post_install block/
	);
});
