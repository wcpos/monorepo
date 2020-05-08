import React, { Component } from 'react';
import logger from '../../lib/logger';
import DefaultFallbackComponent from './fallback';

interface Props {
	children?: any;
	FallbackComponent?: any;
	onError?: (error: Error, componentStack: string) => void;
}

interface State {
	error?: Error;
	info?: React.ErrorInfo;
}

class Boundary extends Component<Props, State> {
	static defaultProps = {
		FallbackComponent: DefaultFallbackComponent,
	};

	state: State = {
		error: undefined,
		info: undefined,
	};

	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		const { onError } = this.props;

		if (typeof onError === 'function') {
			try {
				onError.call(this, error, info ? info.componentStack : '');
			} catch (ignoredError) {
				logger.log({
					ignoredError,
					info,
					level: 'error',
					message: error.toString(),
				});
			}
		} else {
			logger.log({
				error,
				info,
				level: 'error',
				message: error.toString(),
			});
		}

		this.setState({ error, info });
	}

	render() {
		const { children, FallbackComponent } = this.props;
		const { error, info } = this.state;

		if (error) {
			debugger;
			return <FallbackComponent componentStack={info ? info.componentStack : ''} error={error} />;
		}

		return children;
	}
}

export default Boundary;
