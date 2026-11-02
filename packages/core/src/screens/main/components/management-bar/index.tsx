import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';
import { PageBar } from '@wcpos/components/page-bar';

import { BarControls, useBarMenu, useBarStatus } from '../bar-controls';
import { SessionHoldBanner } from '../session-hold-banner';

type Props = React.PropsWithChildren<{
	title?: string;
	/** A scoped room's scope control in the title's place (Reports). */
	titleSlot?: React.ReactNode;
	testID: string;
	search?: React.ReactNode;
	back?: React.ComponentProps<typeof PageBar>['back'];
	/**
	 * Where the bar draws the bell and the avatar: on every size (the list pages), or on a phone
	 * alone (Support, Paul 2026-10-30: on wide its bar is the title, as the Settings and Store
	 * health headings are).
	 */
	controls?: 'all' | 'phone';
}>;

export function ManagementBar({
	title,
	titleSlot,
	testID,
	search,
	back,
	controls = 'all',
	children,
}: Props) {
	const menu = useBarMenu();
	const status = useBarStatus();
	const phone = useIsPhone();
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
				{(controls === 'all' || phone) && <BarControls testID={testID} />}
			</PageBar>
			{/* Under the bar (and its phone search row), where the drawer header showed it: a held session is a state. */}
			<SessionHoldBanner />
		</>
	);
}
