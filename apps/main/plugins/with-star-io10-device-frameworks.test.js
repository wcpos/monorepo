const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

// The line react-native-star-io10 1.12.1 writes into its generated xcconfig (no $(inherited)).
const STAR_XCCONFIG = `EXCLUDED_ARCHS[sdk=iphoneos*] = x86_64
FRAMEWORK_SEARCH_PATHS = $(inherited) "\${PODS_ROOT}/React-Core-prebuilt"
FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*] = $(SRCROOT)/libs/** $(PODS_TARGET_SRCROOT)/ios/libs
HEADER_SEARCH_PATHS = $(inherited) "\${PODS_ROOT}/Headers/Public"
`;

test('defines the fix before prepare_react_native_project! and calls it after react_native_post_install', () => {
	const patched = patchPodfile(PODFILE);
	const def = patched.indexOf('def fix_star_io10_device_framework_search_paths');
	const prepare = patched.indexOf('prepare_react_native_project!');
	const postInstall = patched.indexOf('react_native_post_install(');
	const call = patched.indexOf('    fix_star_io10_device_framework_search_paths(installer)');
	assert.ok(def > -1 && def < prepare);
	assert.ok(call > postInstall);
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

// Runs the Ruby the plugin emits against a stand-in CocoaPods installer and a real xcconfig
// file, so a broken regex or a hook that edits the wrong place fails here, not on a device build.
const hasRuby = spawnSync('ruby', ['--version']).status === 0;
test(
	'the emitted Ruby rewrites only the Star pod’s iphoneos search path, once',
	{ skip: !hasRuby && 'ruby not installed' },
	() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'star-io10-fix-'));
		const starPath = path.join(dir, 'react-native-star-io10.debug.xcconfig');
		const otherPath = path.join(dir, 'other-pod.debug.xcconfig');
		fs.writeFileSync(starPath, STAR_XCCONFIG);
		fs.writeFileSync(otherPath, STAR_XCCONFIG);

		const podfile = patchPodfile(PODFILE);
		const ruby = podfile.slice(
			podfile.indexOf('def fix_star_io10_device_framework_search_paths'),
			podfile.indexOf('prepare_react_native_project!')
		);
		const script = `
module Pod; module UI; def self.warn(msg); $stderr.puts(msg); end; end; end
require 'pathname'
Ref = Struct.new(:real_path)
Config = Struct.new(:base_configuration_reference)
Target = Struct.new(:name, :build_configurations)
Project = Struct.new(:targets)
Installer = Struct.new(:pods_project)
${ruby}
installer = Installer.new(Project.new([
  Target.new('react-native-star-io10', [Config.new(Ref.new(Pathname.new(${JSON.stringify(starPath)})))]),
  Target.new('other-pod', [Config.new(Ref.new(Pathname.new(${JSON.stringify(otherPath)})))]),
]))
fix_star_io10_device_framework_search_paths(installer)
fix_star_io10_device_framework_search_paths(installer)
`;
		execFileSync('ruby', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });

		const star = fs.readFileSync(starPath, 'utf8');
		assert.match(
			star,
			/^FRAMEWORK_SEARCH_PATHS\[sdk=iphoneos\*\] = \$\(inherited\) \$\(SRCROOT\)\/libs\/\*\* /m
		);
		assert.equal(star.match(/\$\(inherited\)/g).length, 3, 'one $(inherited) added, and only one');
		assert.equal(star.split('\n').length, STAR_XCCONFIG.split('\n').length);
		assert.equal(fs.readFileSync(otherPath, 'utf8'), STAR_XCCONFIG, 'other pods untouched');
		fs.rmSync(dir, { recursive: true, force: true });
	}
);
