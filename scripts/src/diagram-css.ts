/** Injected into the page when the packed viewer boots. */
export const DIAGRAM_CSS = String.raw`
    .lens-diagram { position: relative; border: 1px solid var(--color-base-300, #ddd);
      border-radius: .75rem; overflow: clip; margin: 1rem 0;
      background: var(--color-base-100, #fff);
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      /* Hue none, not 0. daisyUI writes oklch(100% 0 0), and a 0 hue pulls every mix toward red. */
      --cy-paper: oklch(from var(--color-base-100, white) l 0 none);
      --cy-field: oklch(from var(--color-base-200, oklch(0.97 0 none)) l 0 none);
      --cy-neutral: oklch(from var(--color-base-content, oklch(0.28 0 none)) l 0 none);
      --cy-ink: var(--color-base-content, oklch(0.28 0.02 none));
      --cy-parent-fill: color-mix(in oklch, var(--cy-paper) 72%, var(--cy-field));
      --cy-parent-line: color-mix(in oklch, var(--cy-neutral) 28%, transparent);
      --cy-parent-ink: color-mix(in oklch, var(--cy-ink) 78%, transparent);
      --cy-plate: var(--cy-paper);
      --cy-plate-line: color-mix(in oklch, var(--cy-neutral) 16%, transparent);
      --cy-same-fill: var(--cy-paper);
      --cy-same-line: color-mix(in oklch, var(--cy-neutral) 36%, var(--cy-paper));
      --cy-added-fill: color-mix(in oklch, var(--color-success, oklch(0.62 0.15 163)) 22%, var(--cy-paper));
      --cy-added-line: light-dark(
        color-mix(in oklch, var(--color-success, oklch(0.55 0.15 163)) 68%, black),
        color-mix(in oklch, var(--color-success, oklch(0.76 0.16 163)) 80%, white));
      --cy-modified-fill: color-mix(in oklch, var(--color-warning, oklch(0.75 0.14 85)) 24%, var(--cy-paper));
      --cy-modified-line: light-dark(
        color-mix(in oklch, var(--color-warning, oklch(0.68 0.14 85)) 62%, black),
        color-mix(in oklch, var(--color-warning, oklch(0.82 0.15 85)) 78%, white));
      --cy-removed-fill: color-mix(in oklch, var(--color-error, oklch(0.58 0.18 25)) 18%, var(--cy-paper));
      --cy-removed-line: light-dark(
        color-mix(in oklch, var(--color-error, oklch(0.55 0.18 25)) 70%, black),
        color-mix(in oklch, var(--color-error, oklch(0.7 0.18 25)) 78%, white)); }
    .lens-diagram .lens-btn {
      flex: none; inline-size: 2.75rem; block-size: 2.75rem;
      display: grid; place-items: center; padding: 0;
      border-radius: .65rem; border: 1px solid var(--color-base-300, #ccc);
      background: transparent; color: inherit; cursor: pointer;
      transition: border-color 160ms var(--ease-out, ease-out),
        background-color 160ms var(--ease-out, ease-out);
    }
    .lens-diagram .lens-btn svg {
      display: block; inline-size: 1.05rem; block-size: 1.05rem;
    }
    .lens-diagram .lens-btn .icon-pause { display: none; }
    .lens-diagram .lens-btn[aria-pressed="true"] .icon-play { display: none; }
    .lens-diagram .lens-btn[aria-pressed="true"] .icon-pause { display: block; }
    .lens-diagram .lens-btn:focus-visible {
      outline: max(2px, 0.08em) solid currentColor;
      outline-offset: 0.15em;
    }
    .lens-diagram .lens-btn:active { background: var(--color-base-200, #eee); }
    @media (hover: hover) and (pointer: fine) {
      .lens-diagram .lens-btn:hover { border-color: var(--color-primary, #4f46e5); }
    }
    .lens-diagram .lens-btn.active { background: var(--color-primary, #4f46e5);
      color: var(--color-primary-content, #fff);
      border-color: transparent; }
    .lens-diagram .cy-canvas {
      inline-size: 100%; block-size: 26rem;
      background: var(--cy-field, oklch(0.97 0 none));
    }
    .lens-diagram .cy-canvas.is-panning { cursor: grabbing !important; }
    .lens-diagram .cy-fullscreen {
      position: absolute; z-index: 2;
      inset-block-start: .5rem; inset-inline-end: .5rem;
      inline-size: 2.75rem; block-size: 2.75rem;
      display: grid; place-items: center; padding: 0;
      border-radius: .65rem; border: 1px solid var(--color-base-300, #ccc);
      background: color-mix(in oklch, var(--color-base-100, #fff) 88%, transparent);
      color: inherit; cursor: pointer;
      box-shadow: 0 1px 4px oklch(0.25 0.02 260 / .18);
      transition: border-color 160ms var(--ease-out, ease-out),
        background-color 160ms var(--ease-out, ease-out);
    }
    .lens-diagram .cy-fullscreen svg {
      display: block; inline-size: 1.05rem; block-size: 1.05rem;
    }
    .lens-diagram .cy-fullscreen .icon-exit { display: none; }
    .lens-diagram .cy-fullscreen[aria-expanded="true"] .icon-enter { display: none; }
    .lens-diagram .cy-fullscreen[aria-expanded="true"] .icon-exit { display: block; }
    .lens-diagram .cy-fullscreen[aria-expanded="true"] {
      border-color: var(--color-primary, #4f46e5);
      background: color-mix(in oklch, var(--color-primary, #4f46e5) 14%, var(--color-base-100, #fff));
    }
    .lens-diagram .cy-fullscreen:focus-visible {
      outline: max(2px, 0.08em) solid currentColor;
      outline-offset: 0.15em;
    }
    .lens-diagram .cy-fullscreen:active { background: var(--color-base-200, #eee); }
    @media (hover: hover) and (pointer: fine) {
      .lens-diagram .cy-fullscreen:hover {
        border-color: var(--color-primary, #4f46e5);
      }
    }
    .lens-diagram .cy-stage,
    .lens-diagram .cy-flow-panel { display: contents; }
    .lens-diagram .cy-flow { display: none; align-items: center; flex-wrap: wrap; gap: .5rem;
      padding: .5rem .75rem; border-top: 1px solid var(--color-base-300, #ddd);
      font-size: .85rem; }
    .lens-diagram .cy-step-note {
      flex: 1 1 12rem; min-inline-size: 0; overflow-wrap: break-word;
    }
    .lens-diagram .cy-flow-dd { flex: 0 1 16rem; min-inline-size: 10rem; }
    .lens-diagram .cy-flow-trigger {
      display: flex; align-items: center; justify-content: space-between;
      gap: .5rem; inline-size: 100%; text-align: start;
      padding: .3rem .65rem; border-radius: .5rem;
      border: 1px solid var(--color-base-300, #ccc);
      background: var(--color-base-100, #fff); color: inherit;
      font: inherit; font-size: .85rem; cursor: pointer;
      transition: border-color 160ms var(--ease-out, ease-out),
        background-color 160ms var(--ease-out, ease-out);
    }
    .lens-diagram .cy-flow-trigger:focus-visible {
      outline: max(2px, 0.08em) solid currentColor;
      outline-offset: 0.15em;
    }
    .lens-diagram .cy-flow-trigger:active { background: var(--color-base-200, #eee); }
    .lens-diagram .cy-flow-trigger[aria-expanded="true"] {
      border-color: var(--color-primary, #4f46e5);
    }
    @media (hover: hover) and (pointer: fine) {
      .lens-diagram .cy-flow-trigger:hover {
        border-color: var(--color-primary, #4f46e5);
      }
    }
    .lens-diagram .cy-flow-trigger-label {
      min-inline-size: 0; overflow: clip; text-overflow: ellipsis; white-space: nowrap;
    }
    .lens-diagram .cy-flow-caret {
      flex: none; inline-size: .5rem; block-size: .5rem;
      background: currentColor; opacity: .7;
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    /* Top-layer menu. Fade in place — no slide from another position.
       margin/inset stay at the UA default outside @supports so a browser
       without anchor positioning still centers the popover. */
    .lens-diagram .cy-flow-menu {
      padding: .3rem; border: 1px solid var(--color-base-300, #ddd);
      border-radius: .65rem; background: var(--color-base-100, #fff);
      color: var(--color-base-content, #111);
      box-shadow: 0 8px 24px oklch(0.25 0.02 260 / .18);
      max-block-size: min(16rem, 50dvh); min-inline-size: 12rem;
      overflow: auto; overscroll-behavior: contain; opacity: 0;
      transition:
        opacity .18s var(--ease-out, ease-out),
        display .18s allow-discrete,
        overlay .18s allow-discrete;
    }
    .lens-diagram .cy-flow-menu:popover-open { opacity: 1; }
    @starting-style {
      .lens-diagram .cy-flow-menu:popover-open { opacity: 0; }
    }
    @supports (position-area: block-start) {
      .lens-diagram .cy-flow-menu {
        margin: 0; margin-block-end: .35rem;
        position-area: block-start span-inline-start;
        position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
        min-inline-size: max(12rem, anchor-size(inline));
      }
    }
    .lens-diagram .cy-flow-option {
      display: flex; align-items: center; gap: .5rem;
      inline-size: 100%; text-align: start; white-space: normal;
      padding: .4rem .55rem; border: 0; border-radius: .45rem;
      background: transparent; color: inherit; font: inherit; cursor: pointer;
      transition:
        background-color 200ms var(--ease-out, ease-out),
        color 200ms var(--ease-out, ease-out);
    }
    .lens-diagram .cy-flow-option::before {
      content: ""; flex: none; inline-size: .45rem; block-size: .45rem;
      border-radius: 999px;
    }
    .lens-diagram .cy-flow-option:focus-visible {
      outline: max(2px, 0.08em) solid currentColor;
      outline-offset: 0.1em;
      background: var(--color-base-200, #f1f5f9);
    }
    .lens-diagram .cy-flow-option:active { background: var(--color-base-300, #e5e7eb); }
    @media (hover: hover) and (pointer: fine) {
      .lens-diagram .cy-flow-option:hover { background: var(--color-base-200, #f1f5f9); }
    }
    .lens-diagram .cy-flow-option[aria-selected="true"] {
      background: color-mix(in oklch, var(--color-primary, #4f46e5) 18%, transparent);
      color: var(--color-primary, #4f46e5);
    }
    .lens-diagram .cy-flow-option[aria-selected="true"]::before { background: currentColor; }
    .lens-diagram .cy-steps { display: none; padding: .4rem .75rem .6rem;
      border-top: 1px solid var(--color-base-300, #ddd); font-size: .8rem;
      max-height: 8rem; overflow: auto; overscroll-behavior: contain; }
    .lens-diagram .cy-step {
      display: flex; align-items: flex-start; gap: .5rem;
      inline-size: 100%; margin-block: .15rem; padding: .35rem .45rem;
      border: 1px solid transparent; border-radius: .5rem;
      background: transparent; color: inherit; font: inherit; font-size: .8rem;
      text-align: start; cursor: pointer;
      transition:
        background-color 220ms var(--ease-out, ease-out),
        border-color 220ms var(--ease-out, ease-out),
        color 220ms var(--ease-out, ease-out);
    }
    .lens-diagram .cy-step:focus-visible {
      outline: max(2px, 0.08em) solid currentColor;
      outline-offset: 0.1em;
      background: var(--color-base-200, #f3f4f6);
    }
    .lens-diagram .cy-step:active { background: var(--color-base-300, #e5e7eb); }
    @media (hover: hover) and (pointer: fine) {
      .lens-diagram .cy-step:hover { background: var(--color-base-200, #f3f4f6); }
    }
    .lens-diagram .cy-step.active {
      background: color-mix(in oklch, #7c3aed 16%, transparent);
      border-color: color-mix(in oklch, #7c3aed 42%, transparent);
    }
    .lens-diagram .cy-step-idx {
      flex: none; min-inline-size: 1.25rem; block-size: 1.25rem;
      display: grid; place-items: center; border-radius: 999px;
      font-size: .7rem; font-weight: 700; font-variant-numeric: tabular-nums;
      background: var(--color-base-200, #e5e7eb);
      transition: background-color 220ms var(--ease-out, ease-out),
        color 220ms var(--ease-out, ease-out);
    }
    .lens-diagram .cy-step.active .cy-step-idx { background: #7c3aed; color: #fff; }
    .lens-diagram .cy-step-text { min-inline-size: 0; }
    .lens-diagram .cy-legend {
      display: flex; flex-wrap: wrap; gap: .35rem .9rem;
      padding-block: .45rem; padding-inline: .75rem;
      border-block-start: 1px solid var(--color-base-300, #ddd);
      background: var(--color-base-100, #fff);
      font-size: .75rem;
      color: color-mix(in oklch, var(--color-base-content, #111) 72%, transparent);
    }
    .lens-diagram .cy-legend span { display: inline-flex; align-items: center; gap: .4rem; }
    .lens-diagram .cy-legend i {
      flex: none; inline-size: .95rem; block-size: .7rem;
      border-radius: .25rem; border: 1.5px solid var(--cy-same-line);
      background: var(--cy-same-fill);
    }
    .lens-diagram .cy-legend i[data-k="added"] {
      background: var(--cy-added-fill); border-color: var(--cy-added-line);
    }
    .lens-diagram .cy-legend i[data-k="modified"] {
      background: var(--cy-modified-fill); border-color: var(--cy-modified-line);
    }
    .lens-diagram .cy-legend i[data-k="removed"] {
      background: var(--cy-removed-fill); border-color: var(--cy-removed-line);
      border-style: dashed;
    }
    /* Author display beats the UA dialog:not([open]) { display: none }. */
    dialog.cy-fs-dialog:not([open]) { display: none; }
    dialog.cy-fs-dialog[open] {
      display: flex; flex-direction: column;
      position: fixed; inset: 0; margin: 0; padding: 0; border: 0;
      inline-size: 100%; block-size: 100%;
      width: 100%; height: 100%;
      max-inline-size: none; max-block-size: none;
      max-width: none; max-height: none;
      overflow: hidden;
      background: var(--color-base-100, canvas);
      color: var(--color-base-content, CanvasText);
    }
    dialog.cy-fs-dialog::backdrop { background: var(--color-base-100, canvas); }
    dialog.cy-fs-dialog[open] .lens-diagram {
      display: flex; flex-flow: row wrap; align-items: stretch;
      flex: 1 1 auto; min-block-size: 0;
      margin: 0; border: 0; border-radius: 0;
      inline-size: 100%; block-size: 100%;
    }
    dialog.cy-fs-dialog[open] .cy-stage {
      display: flex; flex-direction: column; position: relative;
      flex-basis: 0; flex-grow: 999; min-inline-size: 50%; min-block-size: 0;
    }
    dialog.cy-fs-dialog[open] .lens-diagram.has-flows .cy-flow-panel {
      display: flex; flex-direction: column;
      flex-basis: 22rem; flex-grow: 1;
      min-inline-size: min(100%, 18rem); min-block-size: 0; max-block-size: 100%;
      border-inline-start: 1px solid var(--color-base-300, #ddd);
      background: var(--color-base-100, #fff);
    }
    dialog.cy-fs-dialog[open] .lens-diagram:not(.has-flows) .cy-flow-panel { display: none; }
    dialog.cy-fs-dialog[open] .lens-diagram.has-flows .cy-flow {
      display: grid; flex: none;
      grid-template-columns: 2.75rem 2.75rem 2.75rem minmax(0, 1fr);
      align-items: center; gap: .5rem; padding: .75rem;
      border-block-start: 0;
      border-block-end: 1px solid var(--color-base-300, #ddd);
    }
    dialog.cy-fs-dialog[open] .cy-flow-dd {
      grid-column: 1 / -1; inline-size: 100%; min-inline-size: 0;
    }
    dialog.cy-fs-dialog[open] .cy-step-note { grid-column: 1 / -1; }
    dialog.cy-fs-dialog[open] .lens-diagram.has-flows .cy-steps {
      display: block;
      flex: 1 1 auto; min-block-size: 0; max-block-size: none; max-height: none;
      overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable;
      border-block-start: 0;
    }
    dialog.cy-fs-dialog[open] .cy-canvas {
      flex: 1 1 auto; min-block-size: 8rem;
      block-size: auto; height: auto;
    }
    html:has(dialog.cy-fs-dialog[open]) { overflow: hidden; }
  `;
