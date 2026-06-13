import { WidgetType } from '@codemirror/view';

/**
 * 在 diff hunk 起始行行号列内渲染 checkbox 的 CM6 widget
 * 纯 DOM 操作，避免在 CodeMirror 内嵌入 React 的复杂 reconcile 成本
 */
export class HunkCheckboxWidget extends WidgetType {
  readonly hunkIndex: number;
  readonly checked: boolean;
  readonly onToggle: (hunkIndex: number) => void;

  constructor(
    hunkIndex: number,
    checked: boolean,
    onToggle: (hunkIndex: number) => void,
  ) {
    super();
    this.hunkIndex = hunkIndex;
    this.checked = checked;
    this.onToggle = onToggle;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'dt-hunk-checkbox';
    wrap.setAttribute('role', 'checkbox');
    wrap.setAttribute('aria-checked', String(this.checked));
    wrap.setAttribute('aria-label', `标记差异块 ${this.hunkIndex + 1} 为已审`);
    wrap.setAttribute('data-hunk-index', String(this.hunkIndex));
    wrap.setAttribute('data-testid', 'dt-hunk-checkbox');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.tabIndex = -1; // widget 不抢 Tab，Space 仍由外层 keydown 处理
    input.setAttribute('aria-hidden', 'true');

    const visual = document.createElement('span');
    visual.className = 'dt-hunk-checkbox__visual';
    if (this.checked) visual.classList.add('is-checked');

    wrap.appendChild(input);
    wrap.appendChild(visual);

    // 点击 → 触发 toggle；阻止冒泡到编辑器（避免光标移动/选区变化）
    wrap.addEventListener('mousedown', (e) => e.preventDefault());
    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onToggle(this.hunkIndex);
    });

    return wrap;
  }

  eq(other: HunkCheckboxWidget): boolean {
    return other.hunkIndex === this.hunkIndex && other.checked === this.checked;
  }

  ignoreEvent(): boolean {
    return false;
  }

  updateDOM(dom: HTMLElement): boolean {
    // 在 props 变化时由 CM 调用；确保 DOM 与新值一致
    const input = dom.querySelector('input');
    const visual = dom.querySelector('.dt-hunk-checkbox__visual');
    if (input instanceof HTMLInputElement && input.checked !== this.checked) {
      input.checked = this.checked;
    }
    if (visual instanceof HTMLElement) {
      visual.classList.toggle('is-checked', this.checked);
    }
    dom.setAttribute('aria-checked', String(this.checked));
    return true;
  }
}
