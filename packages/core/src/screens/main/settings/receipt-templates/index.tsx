import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@wcpos/components/button';
import { Form, FormField, FormTextarea, useFormChangeHandler } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';

import { FieldPicker } from './field-picker';
import { useTemplates } from './use-templates';
import { useT } from '../../../../contexts/translations';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

import type { ReceiptTemplate, TemplateEngine } from './use-templates';

/**
 * Badge displaying the template engine type.
 */
function EngineBadge({ engine }: { engine: TemplateEngine }) {
	const t = useT();
	const isLegacy = engine === 'legacy-php';

	return (
		<View className={`rounded px-1.5 py-0.5 ${isLegacy ? 'bg-warning/15' : 'bg-primary/10'}`}>
			<HStack className="items-center gap-1">
				{isLegacy && <Icon name="triangleExclamation" size="xs" variant="warning" />}
				<Text className={`text-xs font-medium ${isLegacy ? 'text-warning' : 'text-primary'}`}>
					{isLegacy
						? t('receipt.engine_legacy', 'Legacy PHP')
						: t('receipt.engine_logicless', 'Logicless')}
				</Text>
			</HStack>
		</View>
	);
}

/**
 * Badge displaying the output type.
 */
function OutputBadge({ outputType }: { outputType: string }) {
	return (
		<View className="bg-muted rounded px-1.5 py-0.5">
			<Text className="text-muted-foreground text-xs font-medium">{outputType}</Text>
		</View>
	);
}

/**
 * Template list item with metadata badges.
 */
function TemplateListItem({
	template,
	isSelected,
	onSelect,
}: {
	template: ReceiptTemplate;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<Button
			variant={isSelected ? 'secondary' : 'ghost'}
			onPress={onSelect}
			className="w-full justify-start"
		>
			<VStack className="flex-1 gap-1">
				<Text className="text-sm font-medium">{template.title}</Text>
				<HStack className="gap-1.5">
					<EngineBadge engine={template.engine} />
					<OutputBadge outputType={template.output_type} />
				</HStack>
			</VStack>
		</Button>
	);
}

const editorSchema = z.object({
	content: z.string(),
});

/**
 * Receipt template settings screen.
 *
 * Displays a list of templates with engine/output metadata badges,
 * a template editor with canonical field picker for logicless templates,
 * and a preview panel that renders via the receipts API.
 */
export function ReceiptTemplateSettings() {
	const t = useT();
	const http = useRestHttpClient();
	const { templates, isLoading, error } = useTemplates();
	const [selectedId, setSelectedId] = React.useState<string | number | null>(null);
	const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
	const [isPreviewing, setIsPreviewing] = React.useState(false);
	const iframeRef = React.useRef<HTMLIFrameElement>(null);

	const selectedTemplate = templates.find((tpl) => tpl.id === selectedId) ?? null;

	// Auto-select first template when list loads
	React.useEffect(() => {
		if (templates.length > 0 && selectedId === null) {
			setSelectedId(templates[0].id);
		}
	}, [templates, selectedId]);

	const form = useForm<z.infer<typeof editorSchema>>({
		resolver: zodResolver(editorSchema as never) as never,
		values: { content: selectedTemplate?.content ?? '' },
	});

	/**
	 * Save template content back to the API.
	 * Only database templates (numeric ID) can be saved.
	 */
	const handleChange = React.useCallback(
		async (data: z.infer<typeof editorSchema>) => {
			if (!selectedTemplate || typeof selectedTemplate.id !== 'number') return;
			try {
				await http.put(`/templates/${selectedTemplate.id}`, {
					content: data.content,
				});
			} catch {
				// Error is handled by the HTTP client
			}
		},
		[http, selectedTemplate]
	);

	useFormChangeHandler({
		form: form as never,
		onChange: handleChange as never,
	});

	/**
	 * Fetch a preview of the template using the receipts API.
	 */
	const handlePreview = React.useCallback(async () => {
		if (!selectedTemplate) return;
		setIsPreviewing(true);
		try {
			const response = await http.get('/receipts/preview', {
				params: { template_id: selectedTemplate.id },
			});
			const data = response?.data as { rendered_html?: string };
			setPreviewHtml(data.rendered_html ?? null);
		} catch {
			setPreviewHtml(null);
		} finally {
			setIsPreviewing(false);
		}
	}, [http, selectedTemplate]);

	/**
	 * Insert a field placeholder at the current cursor position.
	 */
	const handleInsertField = React.useCallback(
		(placeholder: string) => {
			const current = form.getValues('content');
			form.setValue('content', current + placeholder, {
				shouldDirty: true,
			});
		},
		[form]
	);

	if (isLoading) {
		return <Loader />;
	}

	if (error) {
		return (
			<VStack className="items-center gap-2 py-8">
				<Icon name="circleExclamation" variant="destructive" />
				<Text className="text-muted-foreground">
					{t('receipt.templates_load_error', 'Failed to load templates')}
				</Text>
			</VStack>
		);
	}

	return (
		<VStack className="gap-4">
			<HStack className="gap-4">
				{/* Template list */}
				<VStack className="w-48 gap-1">
					<Text className="text-muted-foreground mb-1 text-xs font-medium uppercase">
						{t('receipt.templates', 'Templates')}
					</Text>
					{templates.map((tpl) => (
						<TemplateListItem
							key={String(tpl.id)}
							template={tpl}
							isSelected={tpl.id === selectedId}
							onSelect={() => setSelectedId(tpl.id)}
						/>
					))}
				</VStack>

				{/* Editor + field picker */}
				{selectedTemplate && (
					<VStack className="flex-1 gap-4">
						{selectedTemplate.engine === 'legacy-php' && (
							<HStack className="bg-warning/10 items-center gap-2 rounded-md p-3">
								<Icon name="triangleExclamation" size="sm" variant="warning" />
								<Text className="text-warning text-sm">
									{t(
										'receipt.legacy_warning',
										'This template uses the legacy PHP engine. Consider migrating to a logicless template for better compatibility.'
									)}
								</Text>
							</HStack>
						)}

						<HStack className="gap-4">
							{/* Editor */}
							<View className="flex-1">
								<Form {...form}>
									<FormField
										control={form.control}
										name="content"
										render={({ field }) => (
											<FormTextarea
												label={t('receipt.template_content', 'Template')}
												{...field}
												numberOfLines={16}
												className="font-mono"
											/>
										)}
									/>
								</Form>
							</View>

							{/* Field picker — only for logicless templates */}
							{selectedTemplate.engine === 'logicless' && (
								<View className="w-56">
									<Text className="text-muted-foreground mb-1 text-xs font-medium uppercase">
										{t('receipt.available_fields', 'Fields')}
									</Text>
									<FieldPicker onInsert={handleInsertField} />
								</View>
							)}
						</HStack>

						{/* Preview */}
						<VStack className="gap-2">
							<Button variant="outline" onPress={handlePreview} loading={isPreviewing}>
								<Text>{t('receipt.preview_template', 'Preview')}</Text>
							</Button>
							{previewHtml && (
								<View className="border-border h-64 rounded-md border">
									<WebView
										ref={iframeRef as never}
										srcDoc={previewHtml}
										onMessage={() => {}}
										className="flex-1"
									/>
								</View>
							)}
						</VStack>
					</VStack>
				)}
			</HStack>

			<ModalFooter className="px-0">
				<ModalClose>{t('common.close')}</ModalClose>
			</ModalFooter>
		</VStack>
	);
}
