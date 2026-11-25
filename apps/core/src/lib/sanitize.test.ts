import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('keeps the formatting the rich text editor produces', () => {
    const html =
      '<h2>Notes</h2><p><strong>Bold</strong>, <em>italic</em> and <code>code</code></p>' +
      '<ul><li>One</li></ul><blockquote><p>Quoted</p></blockquote>';

    expect(sanitizeHtml(html)).toBe(html);
  });

  it.each([
    ['script tags', '<p>Hi</p><script>alert(1)</script>', '<p>Hi</p>'],
    ['event handlers', '<p onclick="alert(1)">Hi</p>', '<p>Hi</p>'],
    ['inline styles', '<p style="position:fixed">Hi</p>', '<p>Hi</p>'],
    ['javascript: links', '<a href="javascript:alert(1)">Hi</a>', '<a>Hi</a>'],
    ['images', '<p>Hi<img src="x" onerror="alert(1)"></p>', '<p>Hi</p>'],
    ['frames', '<iframe src="https://evil.test"></iframe><p>Hi</p>', '<p>Hi</p>'],
  ])('removes %s', (_name, dirty, clean) => {
    expect(sanitizeHtml(dirty)).toBe(clean);
  });

  it('stops links that open a new tab from reaching back into this page', () => {
    const clean = sanitizeHtml('<a href="https://example.com" target="_blank">Docs</a>');

    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });
});
