import * as React from 'react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { Button, ButtonText } from '../button';
import { HStack } from '../hstack';
import { Icon } from '../icon';
import { cn } from '../lib/utils';

type DocsLinkProps = {
	/** Absolute URL into the documentation site. */
	href: string;
	/** The (translated) link label. */
	children: string;
	testID?: string;
	className?: string;
};

/**
 * The one way the app links out to documentation: a primary-coloured link with a
 * trailing angled arrow, so "this opens the docs in your browser" always looks the
 * same wherever it appears. Routes through `openExternalURL`, which owns the
 * per-platform hand-off to the system browser.
 */
function DocsLink({ href, children, testID, className }: DocsLinkProps) {
	return (
		<Button
			variant="link"
			size="sm"
			role="link"
			testID={testID}
			className={cn('h-auto self-start px-0 py-0', className)}
			onPress={() => openExternalURL(href)}
		>
			<HStack space="xs">
				<ButtonText>{children}</ButtonText>
				<Icon name="arrowUpRight" size="xs" />
			</HStack>
		</Button>
	);
}

export { DocsLink };
