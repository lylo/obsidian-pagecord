import { Notice, requestUrl } from "obsidian";

const DEFAULT_BASE_URL = "https://api.pagecord.com";

export class ApiError extends Error {
	constructor(public status: number, public body: Record<string, unknown>) {
		super(`API error ${status}`);
		this.name = "ApiError";
	}
}

export interface PagecordSettings {
	apiKey: string;
	baseUrl?: string;
}

interface PostParams {
	title?: string;
	content: string;
	slug?: string;
	tags?: string;
	canonical_url?: string;
	status: "published" | "draft";
	content_format: "markdown" | "html";
	published_at?: string;
	hidden?: boolean;
	locale?: string;
}

interface PostResponse {
	token: string;
	title: string;
	slug: string;
	status: string;
}

interface AttachmentResponse {
	attachable_sgid: string;
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
		return this.request<PostResponse>("POST", "/posts", {
			body: JSON.stringify(params),
			contentType: "application/json",
		});
	}

	async updatePost(token: string, params: PostParams): Promise<PostResponse> {
		return this.request<PostResponse>("PATCH", `/posts/${token}`, {
			body: JSON.stringify(params),
			contentType: "application/json",
		});
	}

	async uploadAttachment(filename: string, contentType: string, data: ArrayBuffer): Promise<AttachmentResponse> {
		const { body, boundary } = buildMultipartBody(filename, contentType, data);

		return this.request<AttachmentResponse>("POST", "/attachments", {
			body,
			contentType: `multipart/form-data; boundary=${boundary}`,
		});
	}

	private async request<T>(method: string, path: string, opts: { body: unknown; contentType: string }): Promise<T> {
		const response = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method,
			headers: {
				"Authorization": this.authHeader,
				"Content-Type": opts.contentType,
			},
			body: opts.body as string,
			throw: false,
		});

		if (response.status >= 400) {
			throw new ApiError(response.status, response.json);
		}

		return response.json;
	}
}

export function handleApiError(error: unknown): void {
	if (!(error instanceof ApiError)) {
		new Notice("Could not connect. Check your blog URL.");
		return;
	}

	const { status, body } = error;

	if (status === 401) {
		new Notice("Invalid API key. Check your settings.");
	} else if (status === 403) {
		new Notice("API access requires a premium subscription.");
	} else if (status === 404) {
		new Notice("Post not found.");
	} else if (status === 422) {
		const errors = body?.errors;
		const errorVal = body?.error;
		const message = Array.isArray(errors)
			? errors.join(", ")
			: typeof errorVal === "string" ? errorVal : "";
		new Notice(message || "Validation error");
	} else if (status === 429) {
		new Notice("Rate limited. Wait a moment and try again.");
	} else {
		new Notice("Could not connect. Check your blog URL.");
	}
}

export function buildMultipartBody(filename: string, contentType: string, data: ArrayBuffer) {
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
