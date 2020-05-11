import React from 'react';
import { useObservableState } from 'observable-hooks';
import Avatar from '../../components/avatar';
import Text from '../../components/text';
import Icon from '../../components/icon';
import Button from '../../components/button';
import { SiteWrapper, SiteTextWrapper } from './styles';

/**
 * Options for fetching favicons
 * - https://api.statvoo.com/favicon/?url=${url}
 * - https://www.google.com/s2/favicons?domain=${url}
 * - https://favicongrabber.com/api/grab/${url}
    
 * - https://api.faviconkit.com/${url}/144
 */
const Site = ({ site }) => {
	const status = useObservableState(site.connection_status$, 'default');

	const handleRemove = async () => {
		await site.destroy();
	};

	return (
		<SiteWrapper>
			<Avatar src={`https://api.faviconkit.com/${site.urlWithoutPrefix}/144`} />
			<SiteTextWrapper>
				<Text weight="bold">{site.name || site.urlWithoutPrefix}</Text>
				<Text size="small" type="secondary">
					{site.urlWithoutPrefix}
				</Text>
				<Text size="small">{status}</Text>
				<Button title="Connect again" onPress={() => site.connect()} />
			</SiteTextWrapper>
			<Icon name="remove" onPress={handleRemove} />
		</SiteWrapper>
	);
};

export default Site;
