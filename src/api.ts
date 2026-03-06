import { Notice, requestUrl } from "obsidian";

const DEFAULT_BASE_URL = "https://api.pagecord.com";

export interface PagecordSettings {
	apiKey: string;
	baseUrl?: string; // Override in data.json for development
}

interface PostParams {
	title?: string;
	content: string;
	slug?: string;
	tags_string?: string;
	canonical_url?: string;
	status: "published" | "draft";
	content_format: "markdown";
}

interface PostResponse {
	token: string;
	title: string;
	slug: string;
	status: string;
}

interface AttachmentResponse {
	attachable_sgid: string;
	url: string;
}

export class PagecordAPI {
	constructor(private settings: PagecordSettings) {}

	private get baseUrl(): string {
		return (this.settings.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
	}

	private get authHeader(): string {
		return `Bearer ${this.settings.apiKey}`;
	}

	async createPost(params: PostParams): Promise<PostResponse> {
		return this.request("POST", "/posts", params);
	}

	async updatePost(token: string, params: PostParams): Promise<PostResponse> {
		return this.request("PATCH", `/posts/${token}`, params);
	}

	async uploadAttachment(filename: string, contentType: string, data: ArrayBuffer): Promise<AttachmentResponse> {
		const { body, boundary } = buildMultipartBody(filename, contentType, data);

		const response = await requestUrl({
			url: `${this.baseUrl}/attachments`,
			method: "POST",
			headers: {
				"Authorization": this.authHeader,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
			},
			body,
			throw: false,
		});

		if (response.status >= 400) {
			console.error("Pagecord upload error:", response.status, response.text);
			throw { status: response.status, body: response.json };
		}

		return response.json;
	}

	private async request(method: string, path: string, body: unknown): Promise<any> {
		const response = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method,
			headers: {
				"Authorization": this.authHeader,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			throw: false,
		});

		if (response.status >= 400) {
			console.error("Pagecord API error:", response.status, response.text);
			throw { status: response.status, body: response.json };
		}

		return response.json;
	}
}

export function handleApiError(error: any): void {
	console.error("Pagecord API error:", error, error?.response, error?.response?.text);
	const status = error?.status;

	if (status === 401) {
		new Notice("Invalid API key. Check your Pagecord settings.");
	} else if (status === 403) {
		new Notice("API access requires a premium Pagecord subscription.");
	} else if (status === 404) {
		new Notice("Post not found on Pagecord.");
	} else if (status === 422) {
		const message = error?.body?.errors?.join(", ") ?? error?.body?.error;
		new Notice(`Pagecord: ${message || "Validation error"}`);
	} else if (status === 429) {
		new Notice("Rate limited. Wait a moment and try again.");
	} else {
		new Notice("Could not connect to Pagecord. Check your blog URL.");
	}
}

function buildMultipartBody(filename: string, contentType: string, data: ArrayBuffer) {
	const boundary = "----PagecordUpload" + Date.now().toString(36);
	const encoder = new TextEncoder();

	const preamble = encoder.encode(
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
		`Content-Type: ${contentType}\r\n\r\n`
	);
	const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);

	const body = new Uint8Array(preamble.length + data.byteLength + epilogue.length);
	body.set(preamble, 0);
	body.set(new Uint8Array(data), preamble.length);
	body.set(epilogue, preamble.length + data.byteLength);

	return { body: body.buffer, boundary };
}
