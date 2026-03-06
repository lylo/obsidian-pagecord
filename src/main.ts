import { Plugin, PluginSettingTab, App, Setting } from "obsidian";
import { PagecordSettings } from "./api";
import { publishPost } from "./publish";

const DEFAULT_SETTINGS: PagecordSettings = {
	apiKey: "",
};

export default class PagecordPlugin extends Plugin {
	settings: PagecordSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "publish",
			name: "Publish to Pagecord",
			checkCallback: (checking) => {
				if (!this.app.workspace.getActiveFile()) return false;
				if (!checking) publishPost(this.app, this.settings, "published");
				return true;
			},
		});

		this.addCommand({
			id: "publish-draft",
			name: "Publish as draft to Pagecord",
			checkCallback: (checking) => {
				if (!this.app.workspace.getActiveFile()) return false;
				if (!checking) publishPost(this.app, this.settings, "draft");
				return true;
			},
		});

		this.addSettingTab(new PagecordSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Your Pagecord blog API key.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.apiKey)
					.then((t) => { t.inputEl.type = "password"; })
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
