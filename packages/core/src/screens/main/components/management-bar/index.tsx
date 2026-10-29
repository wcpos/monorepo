import * as React from 'react';

import { PageBar } from '@wcpos/components/page-bar';

import { BarControls, useBarMenu, useOnlineBadge } from '../bar-controls';
import { SessionHoldBanner } from '../session-hold-banner';

type Props = React.PropsWithChildren<{
	title?: string;
	/** A scoped room's scope control in the title's place (Reports). */
	titleSlot?: React.ReactNode;
	testID: string;
	search?: React.ReactNode;
	back?: React.ComponentProps<typeof PageBar>['back'];
}>;

export function ManagementBar({ title, titleSlot, testID, search, back, children }: Props) {
	const menu = useBarMenu();
	const status = useOnlineBadge();
	return (
		<>
			<PageBar
				title={title}
				titleSlot={titleSlot}
				testID={testID}
				back={back}
				status={status}
				search={search}
				onMenu={menu}
			>
				{children}
				{/* The root host: the POS host sits inside the POS screen, which is hidden (web) or
				    detached (native) while a management page is on screen. Switch register raises the
				    same request the rail's sheet does (ruling 2026-10-16, decision 6). */}
				<BarControls testID={testID} />
			</PageBar>
			{/* Under the bar (and its phone search row), where the drawer header showed it: a held session is a state. */}
			<SessionHoldBanner />
		</>
	);
}
