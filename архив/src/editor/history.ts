// История правок для Ctrl+Z / Ctrl+Y: снимки состояния до каждой правки, как в редакторе нот base-v3. Карта маленькая,
// снимок целиком стоит копейки и не требует знать, что именно поменялось.

export class History<T> {
    private past: T[] = [];
    private future: T[] = [];

    constructor(private readonly limit = 200) {}

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }

    /** Запомнить состояние перед правкой. Новая правка обрывает ветку повтора. */
    push(before: T): void {
        this.past.push(before);
        if (this.past.length > this.limit) this.past.shift();
        this.future = [];
    }

    /** Состояние, к которому вернуться (`now` уходит в повтор), или null, если отменять нечего. */
    undo(now: T): T | null {
        const prev = this.past.pop();
        if (prev === undefined) return null;
        this.future.push(now);
        return prev;
    }

    redo(now: T): T | null {
        const next = this.future.pop();
        if (next === undefined) return null;
        this.past.push(now);
        return next;
    }

    clear(): void {
        this.past = [];
        this.future = [];
    }
}
