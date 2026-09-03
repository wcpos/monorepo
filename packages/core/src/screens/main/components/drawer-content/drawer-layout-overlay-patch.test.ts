/**
 * The drawer visibility guard (`panel-visibility.tsx`) hides a settled-closed drawer with
 * `drawerStyle.display: 'none'`. That covers the panel — but `react-native-drawer-layout`
 * renders the dimming `Overlay` as a SIBLING of the panel inside the content view, and derives
 * both its opacity and its `pointerEvents` from the same animated progress. A stale progress
 * therefore leaves a dim, touch-intercepting sheet over the screen the app has navigated to,
 * even with the panel gone.
 *
 * `patches/react-native-drawer-layout@4.2.10.patch` mirrors the panel's `display: 'none'` onto
 * the overlay. The library exposes no option that could do this from the app: `overlayStyle` is
 * built inside `DrawerView` as `{ backgroundColor: overlayColor }` and only `overlayColor` is a
 * screen option, and `pointerEvents` arrives as an animated PROP, which no style can override.
 *
 * This is the tripwire for that patch: an upgrade that drops it fails here rather than silently
 * re-arming monorepo#1691.
 */
import * as fs from 'fs';
import * as path from 'path';

function resolvePatchedDrawer(): string {
	let dir = __dirname;

	for (;;) {
		const candidate = path.join(
			dir,
			'node_modules',
			'react-native-drawer-layout',
			'lib',
			'module',
			'views',
			'Drawer.native.js'
		);
		if (fs.existsSync(candidate)) return candidate;

		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error('Could not find the installed react-native-drawer-layout');
		}
		dir = parent;
	}
}

describe('react-native-drawer-layout overlay patch', () => {
	const source = fs.readFileSync(resolvePatchedDrawer(), 'utf8');

	it('derives the hidden flag from the drawer panel style the app controls', () => {
		expect(source).toContain(
			"const isDrawerPanelHidden = StyleSheet.flatten(drawerStyle)?.display === 'none'"
		);
	});

	it('hides the overlay together with the panel', () => {
		expect(source).toContain('style: [overlayStyle, isDrawerPanelHidden ? styles.hidden : null]');
		expect(source).toContain("display: 'none'");
	});

	it('still renders the overlay unstyled by the patch when the panel is visible', () => {
		// The patch must be additive: the overlay keeps its own `overlayStyle` first, so
		// `overlayColor` and the progress-driven opacity behave exactly as upstream.
		expect(source).not.toContain('style: overlayStyle,');
		expect(source).toContain('[overlayStyle,');
	});
});
