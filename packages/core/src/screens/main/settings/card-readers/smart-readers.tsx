import * as React from 'react';

import { decode } from 'html-entities';

import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
import { DeviceList, DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import { rememberedMode } from '@wcpos/query/store-local';

import { locationName } from './reader-name';
import { SettingsSection } from '../components/settings-section';
import { useT } from '../../../../contexts/translations';
import {
	initialReaderId,
	primaryServerHardware,
	selectableReaders,
} from '../../pos/checkout/tender/tiles';

import type { ReaderActions } from './use-reader-actions';
import type { RememberedReader } from '../../pos/checkout/tender/remembered-readers';

/**
 * The enabled methods whose primary connection is the store's cloud readers. A secondary `server`
 * entry becomes a row with the native slice (wcpos/roadmap#113), when checkout can honour it.
 */
export function smartReaderMethods(methods: readonly PaymentMethodDescriptor[]) {
	return methods.filter(
		(method) => method.pos_enabled && (primaryServerHardware(method)?.readers.length ?? 0) > 0
	);
}

/**
 * Smart readers (wcpos/roadmap#523): the store's cloud readers, one row each with the provider
 * as its chip. The store allows them; this till chooses the one it pays with, in the same memory
 * checkout reads (`initialReaderId`), so the checkout line follows the choice.
 */
export function SmartReaders({
	methods,
	remembered,
	choose,
}: {
	methods: readonly PaymentMethodDescriptor[];
	remembered: Readonly<Record<string, RememberedReader | undefined>>;
	choose: ReaderActions['choose'];
}) {
	const t = useT();

	return (
		<SettingsSection
			first
			title={t('settings.card_readers.section_smart')}
			description={t('settings.card_readers.smart_description')}
			testID="card-readers-smart"
		>
			<DeviceList>
				{methods.flatMap((method) => {
					const hardware = primaryServerHardware(method);
					if (!hardware) return [];
					// What checkout would pay with: the lock, then this till's choice, then the default,
					// then the only usable reader.
					const { readers: usable, lockToDefault } = selectableReaders(method);
					// A device reader's memory is not a cloud choice.
					const memory = remembered[method.id];
					const selected = initialReaderId(
						usable,
						lockToDefault,
						memory && rememberedMode(memory) === 'server' ? memory.id : null
					);
					return hardware.readers.map((reader) => {
						const id = `smart-reader-${method.id}-${reader.id}`;
						const online = reader.status === 'online';
						const isSelected = reader.id === selected;
						return (
							<DeviceRow
								key={`${method.id}:${reader.id}`}
								testID={id}
								icon="card"
								name={reader.label}
								tag={decode(method.title)}
								// The lock is always visible on the store's reader, online or not.
								identifiers={[
									locationName(method),
									lockToDefault && reader.id === hardware.default_reader
										? t('settings.card_readers.set_by_store')
										: null,
								]}
								state={{
									tone: online ? 'ok' : 'muted',
									testID: `${id}-status`,
									label: online ? t('common.online') : t('common.status_offline'),
								}}
							>
								{isSelected ? (
									<DeviceRowActions>
										{/* A selected choice is a Chip; a Button is never a toggle. */}
										<Chip
											label={t('settings.card_readers.selected')}
											on
											readOnly
											testID={`${id}-selected`}
										/>
									</DeviceRowActions>
								) : online && !lockToDefault ? (
									<DeviceRowActions>
										<Button
											variant="ghost"
											onPress={() => void choose(method, reader)}
											testID={`${id}-use`}
										>
											<ButtonText>{t('settings.card_readers.use_this_reader')}</ButtonText>
										</Button>
									</DeviceRowActions>
								) : null}
							</DeviceRow>
						);
					});
				})}
			</DeviceList>
		</SettingsSection>
	);
}
