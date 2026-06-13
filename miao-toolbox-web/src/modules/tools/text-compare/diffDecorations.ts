import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';

// ─── StateEffect & StateField ───

export const setDecorations = StateEffect.define<DecorationSet>();

export const decorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDecorations)) {
        return effect.value;
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

// ─── Reusable decoration instances ───

export const addedLineDeco = Decoration.line({ class: 'dt-diff-line-added' });
export const removedLineDeco = Decoration.line({ class: 'dt-diff-line-removed' });
export const modifiedLineDeco = Decoration.line({ class: 'dt-diff-line-modified' });
export const wordChangedDeco = Decoration.mark({ class: 'dt-diff-word-changed' });

/** 行级 reviewed 遮罩（暗色 50% 黑色 / 亮色 30% 白色）。与原 line deco 并存。 */
export const reviewedLineDeco = Decoration.line({ class: 'dt-diff-line-reviewed' });
