import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect, useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { BulletListIcon, QuoteIcon, RedoIcon, UndoIcon } from './icons';

export interface RichTextEditorProps {
  /** The document as HTML. */
  value: string;
  onChange: (html: string) => void;
  label?: ReactNode;
  placeholder?: string;
  editable?: boolean;
  className?: string;
}

// Without the trailing node the HTML is exactly what was typed, with no empty
// paragraph appended after a closing heading, list or quote.
const editorExtensions = StarterKit.configure({ trailingNode: false });

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection in the editor when the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:text-slate-400',
        active ? 'bg-brand-100 text-brand-800' : 'text-slate-700 hover:bg-slate-200',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      h2: current.isActive('heading', { level: 2 }),
      h3: current.isActive('heading', { level: 3 }),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const run = () => editor.chain().focus();
  const divider = <span aria-hidden="true" className="mx-1 h-5 w-px bg-slate-300" />;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5"
    >
      <ToolbarButton label="Bold" active={state.bold} onClick={() => run().toggleBold().run()}>
        B
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.italic}
        onClick={() => run().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => run().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      {divider}
      <ToolbarButton
        label="Heading 2"
        active={state.h2}
        onClick={() => run().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={state.h3}
        onClick={() => run().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      {divider}
      <ToolbarButton
        label="Bullet list"
        active={state.bulletList}
        onClick={() => run().toggleBulletList().run()}
      >
        <BulletListIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => run().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={state.blockquote}
        onClick={() => run().toggleBlockquote().run()}
      >
        <QuoteIcon className="size-4" />
      </ToolbarButton>
      {divider}
      <ToolbarButton label="Undo" disabled={!state.canUndo} onClick={() => run().undo().run()}>
        <UndoIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!state.canRedo} onClick={() => run().redo().run()}>
        <RedoIcon className="size-4" />
      </ToolbarButton>
    </div>
  );
}

/**
 * A TipTap editor that reads and writes HTML. Sanitise the HTML before
 * rendering it anywhere outside the editor.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  editable = true,
  className,
}: RichTextEditorProps) {
  const labelId = useId();

  const editor = useEditor({
    extensions: [editorExtensions],
    content: value,
    editable,
    editorProps: {
      attributes: {
        class: 'bb-prose min-h-32 px-3 py-2.5',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(label ? { 'aria-labelledby': labelId } : { 'aria-label': placeholder ?? 'Rich text' }),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  const isEmpty = useEditorState({ editor, selector: ({ editor: current }) => current.isEmpty });

  // Follow `value` when the parent changes it (a form reset, loaded data).
  useEffect(() => {
    if (editor.isDestroyed || value === editor.getHTML()) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor.isDestroyed && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <span
          id={labelId}
          className="text-sm font-medium text-slate-800"
          onClick={() => editor.commands.focus()}
        >
          {label}
        </span>
      )}
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xs',
          'focus-within:border-brand-600 focus-within:outline-2 focus-within:outline-brand-600/30',
          !editable && 'bg-slate-50',
        )}
      >
        {editable && <Toolbar editor={editor} />}
        <div className="relative">
          {placeholder && isEmpty && (
            <p
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 left-3 text-[0.9375rem] text-slate-500"
            >
              {placeholder}
            </p>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
