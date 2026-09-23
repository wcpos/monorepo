import { DocsLink } from './index';

export const stories = [
	{
		id: 'default',
		render: () => (
			<DocsLink href="https://docs.wcpos.com/products/sync" testID="gallery-docs-link-default">
				How syncing works
			</DocsLink>
		),
	},
	{
		id: 'code',
		render: () => (
			<DocsLink href="https://docs.wcpos.com" code="HOST121" testID="gallery-docs-link-code">
				Learn more
			</DocsLink>
		),
	},
];
