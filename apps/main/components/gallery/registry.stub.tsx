import type * as React from 'react';

// No gallery imports: Metro substitutes this module for normal and native builds.
export { default as GalleryIndex, default as GalleryComponent } from '../../app/+not-found';

export const IS_GALLERY_BUILD = false;
// Never rendered: RootLayout only reaches it when IS_GALLERY_BUILD is true.
export function GalleryRootLayout(_props: { merchant: React.ComponentType }) {
	return null;
}
