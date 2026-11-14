import * as React from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { TONE, type Tone } from '../lib/tone';
import { cn } from '../lib/utils';

// The tone lives on the disc, its wash and its glyph; `bad` is the only red surface.
// One scale: beside a sheet's title (44), a gate or a finished setup (56), the paid stamp (96).
const sizes = {
	sm: { disc: 'size-11', icon: 'default' },
	default: { disc: 'size-14', icon: '2xl' },
	lg: { disc: 'size-24', icon: '4xl' },
} as const;

/** The round tone mark a state leads with; `icon` overrides the tone's glyph. */
export function ToneDisc(props: {
	tone: Tone;
	icon?: IconName;
	size?: keyof typeof sizes;
	testID?: string;
}) {
	const { disc, text, glyph } = TONE[props.tone];
	const size = sizes[props.size ?? 'default'];
	return (
		<View
			testID={props.testID}
			className={cn('items-center justify-center rounded-full', size.disc, disc)}
		>
			<Icon name={props.icon ?? glyph} size={size.icon} className={text} />
		</View>
	);
}
