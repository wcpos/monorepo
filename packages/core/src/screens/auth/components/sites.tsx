import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import type { SiteDocument, UserDocument } from '@wcpos/database';

import { Site } from './site';

interface SitesProps {
	user: UserDocument;
}

/**
 *
 */
export function Sites({ user }: SitesProps) {
	const sites = useObservableSuspense(
		(
			user as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<SiteDocument[]>;
			}
		).populateResource('sites')
	);

	if (!sites || sites.length === 0) {
		return null;
	}

	/**
	 *
	 */
	return (
		<Card className="w-full">
			{sites.map((site: SiteDocument, index: number) => (
				<ErrorBoundary key={site.uuid}>
					<Site user={user} site={site} idx={index} />
				</ErrorBoundary>
			))}
		</Card>
	);
}
