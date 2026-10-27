import { Chip } from '@wcpos/components/chip';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { isQuickFilterValid, type QuickFilter } from './filter-bar-layout';
import { useT } from '../../../../../contexts/translations';

export function QuickFilterBarPreview({ draft }: { draft: QuickFilter }) {
	const t = useT();
	return (
		<VStack className="gap-2">
			<Text className="text-muted-foreground text-xs tracking-wide uppercase">
				{t('pos_products.on_the_bar')}
			</Text>
			<HStack className="bg-background rounded-lg p-2" testID="quick-filter-bar-preview">
				<Chip
					label={draft.label.trim() || t('pos_products.quick_filter_name_placeholder')}
					on={isQuickFilterValid(draft)}
					add={!draft.label.trim()}
				/>
			</HStack>
		</VStack>
	);
}
