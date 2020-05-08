import React from 'react';
import DefaultFallbackComponent from './fallback';

const changedArray = (a = [], b = []) => a.some((item, index) => !Object.is(item, b[index]));

const initialState = { error: null, info: null };

class ErrorBoundary extends React.Component {
	static defaultProps = {
		FallbackComponent: DefaultFallbackComponent,
	};

	state = initialState;

	resetErrorBoundary = (...args) => {
		this.props.onReset?.(...args);
		this.setState(initialState);
	};

	componentDidCatch(error, info) {
		this.props.onError?.(error, info?.componentStack);
		this.setState({ error, info });
	}

	componentDidUpdate(prevProps) {
		const { error } = this.state;
		const { resetKeys } = this.props;
		if (error !== null && changedArray(prevProps.resetKeys, resetKeys)) {
			this.props.onResetKeysChange?.(prevProps.resetKeys, resetKeys);
			this.setState(initialState);
		}
	}

	render() {
		const { error, info } = this.state;
		const { fallbackRender, FallbackComponent, fallback } = this.props;

		if (error !== null) {
			const props = {
				componentStack: info?.componentStack,
				error,
				resetErrorBoundary: this.resetErrorBoundary,
			};
			if (React.isValidElement(fallback)) {
				return fallback;
			} else if (typeof fallbackRender === 'function') {
				return fallbackRender(props);
			} else if (typeof FallbackComponent === 'function') {
				return <FallbackComponent {...props} />;
			} else {
				throw new Error(
					'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
				);
			}
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
