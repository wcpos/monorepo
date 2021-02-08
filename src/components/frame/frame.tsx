import * as React from 'react';
import { createPortal } from 'react-dom';

const Frame = ({ children, ...props }) => {
	const [contentRef, setContentRef] = React.useState(null);
	const mountNode = contentRef && contentRef.contentWindow.document.body;

	return (
		<iframe {...props} ref={setContentRef}>
			{mountNode && createPortal(React.Children.only(children), mountNode)}
		</iframe>
	);
};

export default Frame;
