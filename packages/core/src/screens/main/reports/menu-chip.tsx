import * as React from 'react';
import { ScrollView } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import { MenuRow, MenuRowGroup } from '@wcpos/components/menu-row';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

export type Choice = { value: string; label: string; hint?: string };
export function MenuChip({
	name,
	icon,
	value,
	defaultValue,
	choices,
	onChange,
	hint,
	scroll = false,
	ids,
}: {
	name: string;
	icon: React.ComponentProps<typeof Chip>['icon'];
	value: string;
	defaultValue: string;
	choices: Choice[];
	onChange: (value: string) => void;
	hint?: string;
	/** A variable-length list (the cashiers) scrolls inside a bounded height; short menus do not. */
	scroll?: boolean;
	ids?: { trigger: string; menu: string; row: (value: string) => string; clear: string };
}) {
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	const t = useT();
	const choose = (next: string) => {
		if (next !== value) onChange(next);
		trigger.current?.close();
	};
	return (
		<Popover>
			<PopoverTrigger ref={trigger} asChild>
				<Chip
					testID={ids?.trigger ?? `hero-chip-${name}`}
					icon={icon}
					label={choices.find((row) => row.value === value)?.label ?? value}
					on={value !== defaultValue}
					onClear={value !== defaultValue ? () => choose(defaultValue) : undefined}
					clearTestID={ids?.clear ?? `hero-chip-${name}-clear`}
					clearLabel={t('common.clear')}
				/>
			</PopoverTrigger>
			<PopoverContent testID={ids?.menu ?? `hero-${name}-menu`}>
				<ScrollView className={scroll ? 'max-h-96' : undefined} scrollEnabled={scroll}>
					<MenuRowGroup>
						{choices.map((row) => (
							<MenuRow
								key={row.value}
								testID={ids?.row(row.value) ?? `hero-${name}-${row.value}`}
								choice
								selected={row.value === value}
								label={row.label}
								description={row.hint}
								onPress={() => choose(row.value)}
							/>
						))}
					</MenuRowGroup>
				</ScrollView>
				{hint && (
					<Text variant="key" className="p-3">
						{hint}
					</Text>
				)}
			</PopoverContent>
		</Popover>
	);
}
