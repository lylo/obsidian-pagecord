import { Plugin, PluginSettingTab, App, ButtonComponent, Modal, Setting, type SettingDefinitionItem } from "obsidian";
import { getConfiguredBlogs, normalizeSettings, PagecordBlogSettings, PagecordSettings } from "./api";
import { publishPost } from "./publish";

const DEFAULT_SETTINGS: PagecordSettings = {
	blogs: [],
};

export default class PagecordPlugin extends Plugin {
	settings: PagecordSettings = { blogs: [] };
	private commandIds: string[] = [];

	async onload() {
		await this.loadSettings();
		this.refreshPublishCommands();
		this.addSettingTab(new PagecordSettingTab(this.app, this));
	}

	async loadSettings() {
		const data = await this.loadData() as Partial<PagecordSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...normalizeSettings(data) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refreshPublishCommands() {
		for (const commandId of this.commandIds) {
			this.removeCommand(commandId);
		}
		this.commandIds = [];

		for (const { index, blog } of getConfiguredBlogs(this.settings)) {
			this.addPublishCommand(`publish-${index}`, `Publish to ${blog.name}`, blog, "published");
			this.addPublishCommand(`publish-draft-${index}`, `Publish to ${blog.name} (draft)`, blog, "draft");
		}
	}

	private addPublishCommand(
		id: string,
		name: string,
		blog: PagecordBlogSettings,
		status: "published" | "draft",
	) {
		this.commandIds.push(id);
		this.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				if (!this.app.workspace.getActiveFile()) return false;
				if (!checking) {
					void publishPost(this.app, { baseUrl: this.settings.baseUrl, ...blog }, status);
				}
				return true;
			},
		});
	}
}

class PagecordSettingTab extends PluginSettingTab {
	plugin: PagecordPlugin;

	constructor(app: App, plugin: PagecordPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "list",
				heading: "Blog connections",
				emptyState: "No blog connections have been added. Add a connection to publish notes to Pagecord.",
				addItem: {
					name: "Add blog connection",
					action: () => {
						this.openBlogModal();
					},
				},
				onDelete: (index) => {
					this.openDeleteModal(index);
				},
				items: this.plugin.settings.blogs.map((blog) => {
					const keySuffix = blog.apiKey.trim().slice(-4);

					return {
						name: blog.name.trim() || "Untitled blog",
						desc: keySuffix ? apiKeySuffixDescription(keySuffix) : "",
						action: (_el: HTMLElement, index: number) => {
							this.openBlogModal(index);
						},
					};
				}),
			},
		];
	}

	private openBlogModal(index?: number) {
		const blog = index === undefined
			? { name: "", apiKey: "" }
			: this.plugin.settings.blogs[index];

		new BlogConnectionModal(this.app, blog, async (nextBlog) => {
			if (index === undefined) {
				this.plugin.settings.blogs.push(nextBlog);
			} else {
				this.plugin.settings.blogs[index] = nextBlog;
			}

			await this.plugin.saveSettings();
			this.plugin.refreshPublishCommands();
			this.update();
		}).open();
	}

	private openDeleteModal(index: number) {
		const blog = this.plugin.settings.blogs[index];
		if (!blog) return;

		new DeleteConnectionModal(this.app, blog, async () => {
			await this.deleteBlog(index);
		}).open();
	}

	private async deleteBlog(index: number) {
		this.plugin.settings.blogs.splice(index, 1);
		await this.plugin.saveSettings();
		this.plugin.refreshPublishCommands();
		this.update();
	}
}

class BlogConnectionModal extends Modal {
	private name = "";
	private apiKey = "";
	private saveButton: ButtonComponent | null = null;

	constructor(
		app: App,
		private blog: PagecordBlogSettings,
		private onSave: (blog: PagecordBlogSettings) => Promise<void>,
	) {
		super(app);
		this.name = blog.name;
		this.apiKey = blog.apiKey;
	}

	onOpen() {
		this.setTitle(this.name ? "Edit blog connection" : "Add blog connection");

		new Setting(this.contentEl)
			.setName("Blog name")
			.setDesc("Used in the command palette.")
			.addText((text) =>
				text
					.setPlaceholder("Blog name")
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
						this.updateSaveButton();
					})
			);

		new Setting(this.contentEl)
			.setName("Blog API key")
			.setDesc("Your blog API key.")
			.addText((text) =>
				text
					.setPlaceholder("API key")
					.setValue(this.apiKey)
					.then((t) => { t.inputEl.type = "password"; })
					.onChange((value) => {
						this.apiKey = value;
						this.updateSaveButton();
					})
			);

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.setDisabled(!this.canSave())
					.then((b) => { this.saveButton = b; })
					.onClick(async () => {
						if (!this.canSave()) return;
						this.close();
						await this.onSave({
							...this.blog,
							name: this.name.trim(),
							apiKey: this.apiKey.trim(),
						});
					})
			);
	}

	private canSave(): boolean {
		return this.name.trim().length > 0 && this.apiKey.trim().length > 0;
	}

	private updateSaveButton() {
		this.saveButton?.setDisabled(!this.canSave());
	}
}

class DeleteConnectionModal extends Modal {
	constructor(
		app: App,
		private blog: PagecordBlogSettings,
		private onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const blogName = this.blog.name.trim();
		const connectionName = blogName || "this blog";
		this.setTitle("Delete blog connection");

		this.contentEl.createEl("p", {
			text: `Are you sure you want to delete the connection to ${connectionName}?`,
		});

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Delete connection")
					.setDestructive()
					.setCta()
					.onClick(async () => {
						this.close();
						await this.onConfirm();
					})
			);
	}
}

function apiKeySuffixDescription(suffix: string): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText("API key ending in ");
		fragment.createEl("strong", { text: suffix });
	});
}
