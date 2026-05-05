import React from 'react';

import {
	ARRAY_DEFAULTS,
	arrayItemTitle,
	ENUM_OPTIONS,
	HIDDEN_PATHS,
	SECTIONS,
} from '../../lib/field-meta';
import { pathLabel } from '../../lib/path-utils';

import type { PathSegment } from '../../lib/path-utils';

interface FieldsTreeProps {
	data: Record<string, unknown>;
	pristine: Record<string, unknown>;
	search: string;
	onChangePath: (path: PathSegment[], value: unknown) => void;
	onAddItem: (path: PathSegment[]) => void;
	onRemoveItem: (path: PathSegment[]) => void;
	onRevertSection: (path: PathSegment[]) => void;
}

export function FieldsTree(props: FieldsTreeProps) {
	const { data, pristine, search, onChangePath, onAddItem, onRemoveItem, onRevertSection } = props;
	const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
	const normalizedSearch = search.trim().toLowerCase();

	const toggleSection = (key: string) =>
		setOpenSections((current) => ({ ...current, [key]: !current[key] }));

	return (
		<div className="fields-tree">
			{SECTIONS.map((section) => {
				const sectionValue = data[section.key];
				const sectionPristine = pristine[section.key];
				const isModified = JSON.stringify(sectionValue) !== JSON.stringify(sectionPristine);
				const arrayCount = Array.isArray(sectionValue) ? sectionValue.length : null;
				const sectionMatches =
					!normalizedSearch || matchesSearch(sectionValue, section.key, normalizedSearch);
				if (!sectionMatches) return null;
				const open = openSections[section.key] ?? Boolean(normalizedSearch);
				return (
					<div key={section.key} className={open ? 'tree-section open' : 'tree-section'}>
						<div className="tree-section-header">
							<button
								type="button"
								className="tree-section-toggle"
								aria-expanded={open}
								onClick={() => toggleSection(section.key)}
							>
								<span className="twirl" aria-hidden="true" />
								<span>{section.label}</span>
								{section.kind === 'array' && arrayCount !== null ? (
									<span
										className={arrayCount > 0 ? 'badge populated' : 'badge'}
										aria-label={`${arrayCount} items`}
									>
										[ {arrayCount} ]
									</span>
								) : null}
							</button>
							{isModified ? (
								<button
									type="button"
									className="revert-button"
									aria-label={`Revert ${section.label}`}
									title="Revert to last shuffle"
									onClick={() => onRevertSection(section.path)}
								>
									↺
								</button>
							) : null}
						</div>
						{open ? (
							<div className="tree-content">
								{section.kind === 'array' ? (
									<ArrayEditor
										arrayKey={section.key}
										items={(sectionValue as unknown[]) ?? []}
										basePath={section.path}
										search={normalizedSearch}
										onChangePath={onChangePath}
										onAddItem={onAddItem}
										onRemoveItem={onRemoveItem}
									/>
								) : (
									<ObjectEditor
										value={(sectionValue as Record<string, unknown>) ?? {}}
										basePath={section.path}
										search={normalizedSearch}
										onChangePath={onChangePath}
									/>
								)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

interface ObjectEditorProps {
	value: Record<string, unknown>;
	basePath: PathSegment[];
	search: string;
	onChangePath: (path: PathSegment[], value: unknown) => void;
}

function ObjectEditor({ value, basePath, search, onChangePath }: ObjectEditorProps) {
	const entries = Object.entries(value);
	return (
		<>
			{entries.map(([key, fieldValue]) => {
				const fieldPath = [...basePath, key];
				const fieldPathString = pathLabel(fieldPath);
				if (HIDDEN_PATHS.has(fieldPathString)) return null;
				if (
					search &&
					!fieldPathString.toLowerCase().includes(search) &&
					!matchesSearch(fieldValue, key, search)
				) {
					return null;
				}
				return (
					<FieldRenderer
						key={fieldPathString}
						fieldKey={key}
						value={fieldValue}
						path={fieldPath}
						search={search}
						onChangePath={onChangePath}
					/>
				);
			})}
		</>
	);
}

interface ArrayEditorProps {
	arrayKey: string;
	items: unknown[];
	basePath: PathSegment[];
	search: string;
	onChangePath: (path: PathSegment[], value: unknown) => void;
	onAddItem: (path: PathSegment[]) => void;
	onRemoveItem: (path: PathSegment[]) => void;
}

function ArrayEditor({
	arrayKey,
	items,
	basePath,
	search,
	onChangePath,
	onAddItem,
	onRemoveItem,
}: ArrayEditorProps) {
	const canAdd = ARRAY_DEFAULTS[arrayKey] !== undefined;
	return (
		<>
			{items.map((item, index) => {
				const itemPath = [...basePath, index];
				const title = arrayItemTitle(arrayKey, item, index);
				return (
					<div key={index} className="array-item">
						<div className="array-item-header">
							<span className="item-title">{title}</span>
							<button
								type="button"
								aria-label={`Remove ${title}`}
								onClick={() => onRemoveItem(itemPath)}
							>
								×
							</button>
						</div>
						{item && typeof item === 'object' ? (
							<ObjectEditor
								value={item as Record<string, unknown>}
								basePath={itemPath}
								search={search}
								onChangePath={onChangePath}
							/>
						) : (
							<FieldRenderer
								fieldKey={String(index)}
								value={item}
								path={itemPath}
								search={search}
								onChangePath={onChangePath}
							/>
						)}
					</div>
				);
			})}
			{canAdd ? (
				<button type="button" className="array-add" onClick={() => onAddItem(basePath)}>
					+ Add
				</button>
			) : null}
		</>
	);
}

interface FieldRendererProps {
	fieldKey: string;
	value: unknown;
	path: PathSegment[];
	search: string;
	onChangePath: (path: PathSegment[], value: unknown) => void;
}

function FieldRenderer({ fieldKey, value, path, search, onChangePath }: FieldRendererProps) {
	const [expanded, setExpanded] = React.useState(false);
	const fieldPathString = pathLabel(path);
	const enumOptions =
		ENUM_OPTIONS[fieldPathString] ?? ENUM_OPTIONS[fieldPathString.replace(/\[\d+\]/g, '')];

	if (enumOptions) {
		return (
			<div className="field-row">
				<label className="field-label" title={fieldPathString}>
					{fieldKey}
				</label>
				<select
					aria-label={fieldKey}
					value={String(value ?? '')}
					onChange={(event) => onChangePath(path, event.target.value)}
				>
					{enumOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</div>
		);
	}

	if (Array.isArray(value)) {
		return (
			<div className="field-row full">
				<label className="field-label" title={fieldPathString}>
					{fieldKey} <span className="badge">[ {value.length} ]</span>
				</label>
				<button type="button" onClick={() => setExpanded((current) => !current)}>
					{expanded ? 'Hide' : 'Edit'}
				</button>
				{expanded ? (
					<div className="nested-array">
						{value.map((item, index) => (
							<div key={index} className="array-item">
								<div className="array-item-header">
									<span className="item-title">{arrayItemTitle(fieldKey, item, index)}</span>
								</div>
								{item && typeof item === 'object' ? (
									<ObjectEditor
										value={item as Record<string, unknown>}
										basePath={[...path, index]}
										search={search}
										onChangePath={onChangePath}
									/>
								) : (
									<input
										aria-label={fieldKey}
										value={String(item ?? '')}
										onChange={(event) => onChangePath([...path, index], event.target.value)}
									/>
								)}
							</div>
						))}
					</div>
				) : null}
			</div>
		);
	}

	if (value !== null && typeof value === 'object') {
		return (
			<div className="field-row full">
				<label className="field-label" title={fieldPathString}>
					{fieldKey}
				</label>
				<button type="button" onClick={() => setExpanded((current) => !current)}>
					{expanded ? 'Hide' : 'Edit'}
				</button>
				{expanded ? (
					<div className="nested-object">
						<ObjectEditor
							value={value as Record<string, unknown>}
							basePath={path}
							search={search}
							onChangePath={onChangePath}
						/>
					</div>
				) : null}
			</div>
		);
	}

	if (typeof value === 'boolean') {
		return (
			<div className="field-row boolean">
				<label className="field-label" title={fieldPathString}>
					{fieldKey}
				</label>
				<input
					aria-label={fieldKey}
					type="checkbox"
					checked={value}
					onChange={(event) => onChangePath(path, event.target.checked)}
				/>
			</div>
		);
	}

	if (typeof value === 'number') {
		return (
			<div className="field-row">
				<label className="field-label" title={fieldPathString}>
					{fieldKey}
				</label>
				<input
					aria-label={fieldKey}
					type="number"
					value={Number.isFinite(value) ? value : 0}
					onChange={(event) => {
						const next = event.target.value;
						const parsed = next === '' ? 0 : Number(next);
						onChangePath(path, Number.isNaN(parsed) ? value : parsed);
					}}
				/>
			</div>
		);
	}

	return (
		<div className="field-row">
			<label className="field-label" title={fieldPathString}>
				{fieldKey}
			</label>
			<input
				aria-label={fieldKey}
				type="text"
				value={String(value ?? '')}
				onChange={(event) => onChangePath(path, event.target.value)}
			/>
		</div>
	);
}

function matchesSearch(value: unknown, key: string, search: string): boolean {
	if (key.toLowerCase().includes(search)) return true;
	if (value == null) return false;
	if (typeof value === 'string') return value.toLowerCase().includes(search);
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value).toLowerCase().includes(search);
	}
	if (Array.isArray(value)) {
		return value.some((item, index) => matchesSearch(item, String(index), search));
	}
	if (typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).some(([childKey, childValue]) =>
			matchesSearch(childValue, childKey, search)
		);
	}
	return false;
}
