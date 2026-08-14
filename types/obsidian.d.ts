// Minimal Obsidian API surface, covering exactly what this plugin uses.
//
// TypeScript resolves the real definitions from node_modules first (see the
// "paths" fallback in tsconfig.json); this file only stands in when
// dependencies are not installed, which is how Obsidian's plugin review scans
// the repo. Without it the obsidian module is unresolvable there, every import
// reads as an untyped error value, and the scan reports hundreds of spurious
// type warnings.
//
// When the plugin starts using a new part of the API, add it here and keep
// `npm run review` green: it type-checks and lints against this stub alone.

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	throw?: boolean;
}

export interface RequestUrlResponse {
	status: number;
	json: unknown;
}

export function requestUrl(request: RequestUrlParam): Promise<RequestUrlResponse>;

export class Notice {
	constructor(message: string | DocumentFragment, duration?: number);
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
}

interface CachedMetadata {
	frontmatter?: unknown;
}

export class Workspace {
	getActiveFile(): TFile | null;
}

export class MetadataCache {
	getFileCache(file: TFile): CachedMetadata | null;
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
}

export class Vault {
	read(file: TFile): Promise<string>;
	readBinary(file: TFile): Promise<ArrayBuffer>;
}

export class FileManager {
	processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void>;
}

export class App {
	workspace: Workspace;
	metadataCache: MetadataCache;
	vault: Vault;
	fileManager: FileManager;
}

export interface Command {
	id: string;
	name: string;
	checkCallback?: (checking: boolean) => boolean;
}

export class Plugin {
	app: App;
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
	addCommand(command: Command): Command;
	removeCommand(commandId: string): void;
	addSettingTab(tab: PluginSettingTab): void;
	onload(): void | Promise<void>;
}

export interface SettingDefinitionBase {
	name: string;
	desc?: string | DocumentFragment;
}

export interface SettingDefinitionAction extends SettingDefinitionBase {
	action: (el: HTMLElement, index: number) => void;
}

export type SettingDefinition = SettingDefinitionAction;

export interface SettingDefinitionAddItem {
	name: string;
	action: (el: HTMLElement) => void;
}

export interface SettingDefinitionList {
	type: "list";
	heading?: string;
	emptyState?: string | DocumentFragment;
	addItem?: SettingDefinitionAddItem;
	onDelete?: (index: number) => void;
	onReorder?: (oldIndex: number, newIndex: number) => void;
	items?: SettingDefinition[];
}

export type SettingDefinitionItem = SettingDefinition | SettingDefinitionList;

export class PluginSettingTab {
	app: App;
	containerEl: HTMLElement;
	constructor(app: App, plugin: Plugin);
	getSettingDefinitions(): SettingDefinitionItem[];
	update(): void;
}

export class Modal {
	app: App;
	contentEl: HTMLElement;
	constructor(app: App);
	setTitle(title: string): this;
	open(): void;
	close(): void;
	onOpen(): void;
}

export class TextComponent {
	inputEl: HTMLInputElement;
	setPlaceholder(placeholder: string): this;
	setValue(value: string): this;
	onChange(callback: (value: string) => unknown): this;
	then(callback: (component: this) => unknown): this;
}

export class ButtonComponent {
	setButtonText(text: string): this;
	setCta(): this;
	setDestructive(): this;
	setDisabled(disabled: boolean): this;
	onClick(callback: () => unknown): this;
	then(callback: (component: this) => unknown): this;
}

export class Setting {
	constructor(containerEl: HTMLElement);
	setName(name: string): this;
	setDesc(desc: string | DocumentFragment): this;
	addText(callback: (text: TextComponent) => unknown): this;
	addButton(callback: (button: ButtonComponent) => unknown): this;
}

interface DomElementInfo {
	text?: string;
	cls?: string;
}

declare global {
	interface DocumentFragment {
		appendText(text: string): void;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, info?: DomElementInfo | string): HTMLElementTagNameMap[K];
	}

	interface HTMLElement {
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, info?: DomElementInfo | string): HTMLElementTagNameMap[K];
		empty(): void;
	}

	function createFragment(callback?: (fragment: DocumentFragment) => void): DocumentFragment;
}
