import DOMPurify from 'dompurify';

/** The tags the rich text editor can produce. Everything else is dropped. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'em',
  's',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // A link that opens a new tab must not hand that tab a reference to this page.
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Makes user-written HTML safe to render with `dangerouslySetInnerHTML`:
 * scripts, event handlers, styles and `javascript:` links are removed.
 *
 * Sanitise at the point of rendering, every time — never trust that stored
 * HTML was cleaned when it was saved.
 *
 * @example
 *   <div className="bb-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(note) }} />
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
