/**
 * A plain ban: the type ladder is `Text variant=…` (help, key, subheading, caption), and no `Text`
 * restates a rank as class strings. The burn-down baseline emptied with card 6's migration
 * (W4-F, 2026-10-29) and was deleted; a site is refused, not counted. Read the site the failure
 * names and use the variant (`TEXT_LADDER.<rank>` on a text context).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONSTRUCT, scanRepository, scanSource } from './text-ladder-scanner.mjs';

const path = 'packages/core/src/screens/main/new-file.tsx';

test('no Text restates a ladder rank as class strings', () => {
	assert.deepEqual(scanRepository(), []);
});

test('each ladder combo on a Text is one site; a variant is none', () => {
	for (const classes of [
		'text-muted-foreground text-xs',
		'text-sm text-muted-foreground',
		'flex-1 text-sm font-medium',
		'text-base font-medium',
		'text-xs font-semibold tracking-wide uppercase',
	])
		assert.deepEqual(scanSource(`<Text className="${classes}" />`, path), [
			`${path}:1:1:${CONSTRUCT}`,
		]);
	assert.deepEqual(scanSource('<Text variant="help" className="flex-1" />', path), []);
});

// A combination is a site only inside ONE string literal or ONE local constant: a control's own
// label size with a conditional weight in another cn() branch (a chip's `sm`, a segment's
// selected weight) is the control's design, not the ladder (owner's ruling, 2026-10-28, W4-F).
test('reads one literal or one constant at a time; ignores other elements and lone classes', () => {
	const source = `
		const LABEL = 'text-muted-foreground mb-1 text-xs';
		<Text className={LABEL} />;
		<Text className={cn('text-muted-foreground text-sm', className)} />;
		<Text className={cn('text-sm', active && 'font-medium')} />;
		<View className="text-muted-foreground text-xs" />;
		<Text className="text-muted-foreground" />;
	`;
	assert.deepEqual(scanSource(source, path), [
		`${path}:3:1:${CONSTRUCT}`,
		`${path}:4:1:${CONSTRUCT}`,
	]);
});
