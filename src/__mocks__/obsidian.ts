class FakeElement {
	children: FakeElement[] = [];
	private listeners: Record<string, (event: { stopPropagation: () => void }) => void> = {};

	addClass(): void {}

	createEl(): FakeElement {
		const child = new FakeElement();
		this.children.push(child);
		return child;
	}

	addEventListener(type: string, listener: (event: { stopPropagation: () => void }) => void): void {
		this.listeners[type] = listener;
	}

	click(): void {
		this.listeners.click?.({ stopPropagation: () => {} });
	}
}

export class Notice {
	static messages: string[] = [];
	static instances: Notice[] = [];
	messageEl = new FakeElement();

	constructor(message: string) {
		Notice.messages.push(message);
		Notice.instances.push(this);
	}

	setMessage(message: string): this {
		Notice.messages.push(message);
		return this;
	}
}

export function requestUrl(): never {
	throw new Error("requestUrl should not be called in tests");
}

export function setIcon(): void {}
