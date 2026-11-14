const fs = require('fs');
const path = require('path');

const { createRunOncePlugin, withDangerousMod } = require('@expo/config-plugins');

// react-native-star-io10 1.12.1 sets `FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*]` in its podspec
// WITHOUT `$(inherited)`, so on a DEVICE build the pod loses every inherited framework search
// path — including React's prebuilt framework (Expo SDK 58 ships React Native precompiled) —
// and fails with "'React/RCTBridgeModule.h' file not found". Simulator builds are unaffected,
// which is why EAS development builds never showed it (2026-10-06, local Xcode device build
// for the Tap to Pay dev client). This post_install hook puts `$(inherited)` back.
const POST_INSTALL_FIX = `
def fix_star_io10_device_framework_search_paths(installer)
  # pod_target_xcconfig values live in the generated .xcconfig files, not in the project's
  # build settings, so the file is what has to change.
  installer.pods_project.targets.each do |target|
    next unless target.name == 'react-native-star-io10'
    target.build_configurations.each do |config|
      ref = config.base_configuration_reference
      next if ref.nil?
      path = ref.real_path
      contents = File.read(path)
      patched = contents.sub(
        /^(FRAMEWORK_SEARCH_PATHS\\[sdk=iphoneos\\*\\] = )(?!\\$\\(inherited\\))/,
        '\\1$(inherited) '
      )
      if patched == contents
        Pod::UI.warn "[with-star-io10-device-frameworks] no FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*] line to fix in #{path}" unless contents.include?('$(inherited)')
      else
        File.write(path, patched)
      end
    end
  end
end
`;

function patchPodfile(contents) {
	let next = contents;
	if (!next.includes('def fix_star_io10_device_framework_search_paths')) {
		if (!next.includes('prepare_react_native_project!'))
			throw new Error(
				'with-star-io10-device-frameworks: no prepare_react_native_project! in Podfile'
			);
		next = next.replace(
			'prepare_react_native_project!',
			`${POST_INSTALL_FIX}\nprepare_react_native_project!`
		);
	}
	if (!/^\s+fix_star_io10_device_framework_search_paths\(installer\)/m.test(next)) {
		const patched = next.replace(
			/(\s+react_native_post_install\(\n[\s\S]*?\n\s+\)\n)/,
			'$1\n    fix_star_io10_device_framework_search_paths(installer)\n'
		);
		if (patched === next)
			throw new Error(
				'with-star-io10-device-frameworks: no react_native_post_install block in Podfile'
			);
		next = patched;
	}
	return next;
}

function withStarIo10DeviceFrameworks(config) {
	return withDangerousMod(config, [
		'ios',
		async (mod) => {
			const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
			fs.writeFileSync(podfilePath, patchPodfile(fs.readFileSync(podfilePath, 'utf8')));
			return mod;
		},
	]);
}

module.exports = createRunOncePlugin(
	withStarIo10DeviceFrameworks,
	'with-star-io10-device-frameworks',
	'0.1.0'
);
module.exports.patchPodfile = patchPodfile;
