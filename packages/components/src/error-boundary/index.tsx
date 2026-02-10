import * as React from 'react';

import { ErrorBoundary as Boundary, ErrorBoundaryPropsWithComponent } from 'react-error-boundary';

import { Fallback as DefaultFallback } from './fallback';

type Props = Omit<React.PropsWithChildren<ErrorBoundaryPropsWithComponent>, 'FallbackComponent'> & {
	FallbackComponent?: React.ComponentType<any>;
};

export function ErrorBoundary({ FallbackComponent = DefaultFallback, ...props }: Props) {
	return <Boundary FallbackComponent={FallbackComponent} {...props} />;
}
