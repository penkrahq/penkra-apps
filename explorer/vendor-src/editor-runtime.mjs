import { basicSetup } from "codemirror";
import { redo, undo } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { classHighlighter, highlightTree, tags } from "@lezer/highlight";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const sourceHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syntax-number)" },
  { tag: [tags.comment, tags.docComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syntax-function)" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type)" },
  { tag: [tags.tagName, tags.attributeName], color: "var(--syntax-tag)" },
  { tag: [tags.heading, tags.strong], color: "var(--syntax-heading)", fontWeight: "650" },
  { tag: tags.link, color: "var(--syntax-link)", textDecoration: "underline" },
  { tag: [tags.invalid, tags.deleted], color: "var(--syntax-invalid)" },
]);

function extensionOf(name) {
  const index = String(name).lastIndexOf(".");
  return index > 0 ? String(name).slice(index + 1).toLowerCase() : "";
}

function languageFor(name) {
  const extension = extensionOf(name);
  if (["js", "cjs", "mjs"].includes(extension)) return javascript();
  if (extension === "jsx") return javascript({ jsx: true });
  if (["ts", "mts", "cts"].includes(extension)) return javascript({ typescript: true });
  if (extension === "tsx") return javascript({ jsx: true, typescript: true });
  if (["json", "jsonc", "json5", "jsonl", "tsbuildinfo"].includes(extension)) return json();
  if (["css", "scss", "less"].includes(extension)) return css();
  if (["html", "htm", "svg", "xml"].includes(extension)) return html();
  if (["md", "markdown", "mdown"].includes(extension)) return markdown();
  if (["yaml", "yml"].includes(extension)) return yaml();
  if (extension === "py") return python();
  if (extension === "rs") return rust();
  if (extension === "go") return go();
  if (extension === "toml") return StreamLanguage.define(tomlMode);
  if (["sh", "bash", "zsh"].includes(extension) || ["Dockerfile", "Makefile"].includes(name)) {
    return StreamLanguage.define(shell);
  }
  return [];
}

export function createEditor({ parent, name, doc, editorState, onChange, onSave }) {
  if (editorState) return new EditorView({ state: editorState, parent });
  const extensions = [
    basicSetup,
    languageFor(name),
    syntaxHighlighting(sourceHighlight),
    EditorState.tabSize.of(2),
    Prec.highest(keymap.of([
      { key: "Mod-z", preventDefault: true, run: undo },
      { key: "Mod-y", mac: "Mod-Shift-z", preventDefault: true, run: redo },
      { linux: "Ctrl-Shift-z", preventDefault: true, run: redo },
      { key: "Mod-s", preventDefault: true, run: () => { onSave(); return true; } },
    ])),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString(), update.state);
    }),
    EditorView.theme({
      "&": { height: "100%", background: "transparent", color: "var(--text)" },
      ".cm-scroller": { overflow: "auto", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: "12px", lineHeight: "1.65" },
      ".cm-content": { padding: "14px 0 60px" },
      ".cm-line": { padding: "0 18px 0 6px" },
      ".cm-gutters": { background: "var(--canvas)", color: "var(--tertiary)", border: "0", paddingLeft: "8px" },
      ".cm-activeLine, .cm-activeLineGutter": { background: "var(--active-line)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "var(--editor-selection) !important" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      ".cm-focused": { outline: "none" },
      ".cm-panels": { background: "var(--panel)", color: "var(--text)" },
      ".cm-tooltip": { background: "var(--panel)", border: "1px solid var(--border)" },
    }),
  ];
  return new EditorView({ doc, extensions, parent });
}

export function runEditorHistoryShortcut(event, view) {
  if (!view?.hasFocus || !(event.metaKey || event.ctrlKey) || event.altKey) return false;
  const key = event.key.toLocaleLowerCase();
  const command = key === "z" ? (event.shiftKey ? redo : undo) : key === "y" && !event.shiftKey ? redo : null;
  if (!command) return false;
  command(view);
  return true;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function highlightCode(source, languageName) {
  const support = languageFor(`code.${String(languageName || "txt").trim().toLowerCase()}`);
  const language = support?.language;
  if (!language?.parser) return escapeHtml(source);
  let output = "";
  let position = 0;
  highlightTree(language.parser.parse(source), classHighlighter, (from, to, classes) => {
    output += escapeHtml(source.slice(position, from));
    output += `<span class="${classes}">${escapeHtml(source.slice(from, to))}</span>`;
    position = to;
  });
  return output + escapeHtml(source.slice(position));
}

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  highlight(source, languageName) {
    return `<pre class="code-block"><code>${highlightCode(source, languageName)}</code></pre>`;
  },
}).use(taskLists, { enabled: false, label: true, labelAfter: true });

export function renderMarkdown(source) {
  return markdownRenderer.render(String(source ?? ""));
}
