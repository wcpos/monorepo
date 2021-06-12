import * as React from 'react';
import useObservable from '@wcpos/common/src/hooks/use-observable';
import Tag from '@wcpos/common/src/components/tag';
import { ProductQueryContext } from '../../../products';

type Props = {
	product: import('@wcpos/common/src/database').ProductDocument;
};

const Tags = ({ product }: Props) => {
	const tags = useObservable(product.tags$) || [];
	const { query, setQuery } = React.useContext(ProductQueryContext);

	const handleSelectTag = (tag: any) => {
		query.filter.tags = [tag];
		setQuery({ ...query });
	};

	return tags.map((tag: any) => (
		<Tag key={tag.id} onPress={() => handleSelectTag(tag)}>
			{tag.name}
		</Tag>
	));
};

export default Tags;
