import { EditorView } from '@codemirror/view';

/**
 * Mirrors `wordpressTheme` from the woocommerce-pos template-editor package.
 * Adapted to fill the host container so the editor can flex inside the
 * Studio code panel.
 */
export const wordpressTheme = EditorView.theme({
	'&': {
		fontSize: '13px',
		fontFamily: 'Menlo, Consolas, Monaco, "Liberation Mono", "Lucida Console", monospace',
		height: '100%',
		backgroundColor: '#fdfcf8',
	},
	'.cm-scroller': {
		overflow: 'auto',
		fontFamily: 'inherit',
	},
	'.cm-content': {
		padding: '8px 0',
	},
	'.cm-gutters': {
		backgroundColor: '#f6f7f7',
		borderRight: '1px solid #ddd',
		color: '#999',
	},
	'.cm-activeLineGutter': {
		backgroundColor: '#e8f0fe',
	},
	'.cm-activeLine': {
		backgroundColor: '#f0f6fc',
	},
	'.cm-mustache': {
		color: '#b5533c',
		fontWeight: 'bold',
	},
});
