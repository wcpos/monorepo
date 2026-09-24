const { withMainActivity } = require('expo/config-plugins');
// Unattended runs: between rows the Pixel locks and dozes, and an activity launched behind a
// secure keyguard never becomes visible (the driver's `am start -W` then hangs and the row fails
// as a launch failure, 2026-09-24). Show the activity over the lock screen and turn the screen
// on, as alarm apps do; expo-keep-awake then holds it for the job.
module.exports = (config) =>
	withMainActivity(config, (mod) => {
		const anchor = 'super.onCreate(null)';
		if (!mod.modResults.contents.includes('setShowWhenLocked(true)'))
			mod.modResults.contents = mod.modResults.contents.replace(
				anchor,
				`${anchor}\n    setShowWhenLocked(true)\n    setTurnScreenOn(true)`
			);
		return mod;
	});
