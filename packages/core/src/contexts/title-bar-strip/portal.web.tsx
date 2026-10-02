import * as React from 'react';

import { createPortal } from 'react-dom';

import { useTitleBarStrip } from './index';

/** Renders its children into the desktop strip's host node; nothing when there is none. */
export function TitleBarStripPortal({ children }: React.PropsWithChildren) {
	const { node } = useTitleBarStrip();
	if (!node) return null;
	return createPortal(children, node);
}
