import * as fs from 'fs';
import * as path from 'path';

/**
 * A count on a glyph is `Icon count` (IconButton `count`, NavItem `count`): the glyph owns its
 * shoulder, so the badge is measured from the glyph's box whatever parent the icon sits in. Two
 * hand-placed badges used the same `-top-1 -right-0.5` from different boxes and the bell's sat 13
 * higher and further out than Store health's (Paul, 2026-11-08: "Surely a button with an icon and
 * a badge should be a shared component so this sort of thing can't happen.").
 */
const ROOT = path.resolve(__dirname, '../../../..');
const SCANNED = ['packages/components/src', 'packages/core/src', 'apps/main'];
const HOME = 'packages/components/src/icon/index.tsx';
// A `Badge` whose nearest JSX parent is an absolutely placed `View` (a comment may sit between).
const HAND_PLACED = /<View[^>]*className=["'{][^>]*\babsolute\b[^>]*>\s*(?:\{[^}]*\}\s*)?<Badge\b/s;

function sources(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full);
		const skipped = /\.test\./.test(entry.name) || entry.name === 'gallery.tsx';
		return !skipped && /\.tsx?$/.test(entry.name) ? [full] : [];
	});
}

// The two sites this fence exists for, verbatim from `origin/main` before the count moved onto Icon.
const OLD_BELL = `
				{/* Always mounted: the badge has to be there to show the first one arrive. */}
				<View pointerEvents="none" className="absolute -top-1 -right-0.5">
					<Badge count={unreadCount} max={99} variant="bad" size="sm" />
				</View>`;
const OLD_LOGS_BADGE = `
export function LogsBadge({ unread }: { unread: number }) {
	return (
		<View className="absolute -top-1 -right-0.5">
			<Badge count={unread} max={99} variant="bad" size="sm" />
		</View>
	);
}`;

it.each([
	['notification-bell.tsx', OLD_BELL],
	['logs-badge.tsx', OLD_LOGS_BADGE],
])('bites on the old hand-placed badge in %s', (_name, source) => {
	expect(source).toMatch(HAND_PLACED);
});

it('places no Badge over a glyph by hand outside Icon', () => {
	const offenders = SCANNED.flatMap((dir) => sources(path.join(ROOT, dir)))
		.map((file) => path.relative(ROOT, file))
		.filter((file) => file !== HOME)
		.filter((file) => HAND_PLACED.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
	for (const file of offenders)
		throw new Error(
			`a count on a glyph is \`Icon count\` (IconButton \`count\`, NavItem \`count\`); never place a Badge by hand — ${file}`
		);
	// The home itself is the one match, so the fence reads the real source and not an empty tree.
	expect(HAND_PLACED.test(fs.readFileSync(path.join(ROOT, HOME), 'utf8'))).toBe(true);
});
