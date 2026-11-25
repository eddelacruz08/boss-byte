/** Shared look for text-like form controls (inputs, textareas, select and date triggers). */
export const controlClasses =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs ' +
  'placeholder:text-slate-500 transition-colors ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-0 focus:outline-brand-600/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const controlInvalidClasses = 'border-red-600 focus:border-red-600 focus:outline-red-600/30';

/** Focus ring for buttons and other clickable elements. */
export const focusRingClasses =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
