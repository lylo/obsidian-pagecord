import { Plugin, PluginSettingTab, App, ButtonComponent, Modal, Setting, SettingGroup } from "obsidian";
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
					void publishPost(this.app, { ...blog, baseUrl: this.settings.baseUrl }, status);
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

	display() {
		const { containerEl } = this;
		containerEl.empty();
		const heading = "Pagecord Blog Connections";
		const emptyMessage = "No blog connections have been added. Add a connection to publish notes to Pagecord.";

		new Setting(containerEl)
			.setName(heading)
			.setHeading()
			.addExtraButton((button) =>
				button
					.setIcon("plus")
					.setTooltip("Add blog connection")
					.onClick(() => {
						this.openBlogModal();
					})
			);

		const blogGroup = new SettingGroup(containerEl);

		if (this.plugin.settings.blogs.length === 0) {
			blogGroup.addSetting((setting) => {
				setting.setDesc(emptyMessage);
			});
			return;
		}

		this.plugin.settings.blogs.forEach((blog, index) => {
			const name = blog.name.trim() || "Untitled blog";
			const keySuffix = blog.apiKey.trim().slice(-4);
			const connectionDesc = keySuffix ? apiKeySuffixDescription(keySuffix) : "";

			blogGroup.addSetting((setting) => {
				setting
					.setName(name)
					.setDesc(connectionDesc)
					.addExtraButton((button) =>
						button
							.setIcon("pencil")
							.setTooltip("Edit blog connection")
							.onClick(() => {
								this.openBlogModal(index);
							})
					)
					.addExtraButton((button) =>
						button
							.setIcon("trash")
							.setTooltip("Delete blog connection")
							.onClick(async () => {
								await this.deleteBlog(index);
							})
					);
			});
		});
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
			this.display();
		}).open();
	}

	private async deleteBlog(index: number) {
		this.plugin.settings.blogs.splice(index, 1);
		await this.plugin.saveSettings();
		this.plugin.refreshPublishCommands();
		this.display();
	}
}

class BlogConnectionModal extends Modal {
	private name = "";
	private apiKey = "";
	private saveButton: ButtonComponent | null = null;

	constructor(
		app: App,
		blog: PagecordBlogSettings,
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

function apiKeySuffixDescription(suffix: string): DocumentFragment {
	const fragment = document.createDocumentFragment();
	fragment.appendText("API key ending in ");
	fragment.createEl("strong", { text: suffix });
	return fragment;
}
