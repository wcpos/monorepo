import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { POSTER_BAND } from './scrim-stops';

/**
 * The band itself (web, and Electron): `POSTER_BAND`. The web has no system font scale, so the
 * type scale's variables are the whole story here; `band.native.tsx` also follows the OS text
 * size, as `Text` does.
 */
export function PosterBand({ className, ...props }: ViewProps & { className?: string }) {
	return <View {...props} className={`${POSTER_BAND}${className ? ` ${className}` : ''}`} />;
}
