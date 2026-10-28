import * as React from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';

// The tone lives on the disc, its wash and its glyph; `bad` is the only red surface.
const tones = {
	ok: { disc: 'bg-ok-bg', glyph: 'text-ok', icon: 'check' },
	warn: { disc: 'bg-warn-bg', glyph: 'text-warn-text', icon: 'warning' },
	bad: { disc: 'bg-bad-bg', glyph: 'text-bad', icon: 'alert' },
	muted: { disc: 'bg-muted', glyph: 'text-muted-foreground', icon: 'info' },
} as const;
// One scale: beside a sheet's title (44), a gate or a finished setup (56), the paid stamp (96).
const sizes = {
	sm: { disc: 'size-11', icon: 'default' },
	default: { disc: 'size-14', icon: '2xl' },
	lg: { disc: 'size-24', icon: '4xl' },
} as const;

/** The round tone mark a state leads with; `icon` overrides the tone's glyph. */
export function ToneDisc(props: {
	tone: keyof typeof tones;
	icon?: IconName;
	size?: keyof typeof sizes;
	testID?: string;
}) {
	const { disc, glyph, icon } = tones[props.tone];
	const size = sizes[props.size ?? 'default'];
	return (
		<View
			testID={props.testID}
			className={cn('items-center justify-center rounded-full', size.disc, disc)}
		>
			<Icon name={props.icon ?? icon} size={size.icon} className={glyph} />
		</View>
	);
}
