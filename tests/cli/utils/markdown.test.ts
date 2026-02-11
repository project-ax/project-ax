// tests/cli/utils/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/cli/utils/markdown.js';

describe('renderMarkdown', () => {
  it('should render plain text unchanged', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });

  it('should render bold text', () => {
    const result = renderMarkdown('This is **bold** text');
    expect(result).toContain('bold');
    expect(result).toContain('This is');
    expect(result).toContain('text');
  });

  it('should render italic text', () => {
    const result = renderMarkdown('This is *italic* text');
    expect(result).toContain('italic');
  });

  it('should render inline code', () => {
    const result = renderMarkdown('Use `console.log()` here');
    expect(result).toContain('console.log()');
  });

  it('should render code blocks with language', () => {
    const result = renderMarkdown('```javascript\nconst x = 1;\n```');
    expect(result).toContain('const');
    expect(result).toContain('x');
    expect(result).toContain('javascript');
  });

  it('should render code blocks without language', () => {
    const result = renderMarkdown('```\nsome code\n```');
    expect(result).toContain('some code');
  });

  it('should render headers with prefix', () => {
    const result = renderMarkdown('# Header 1');
    expect(result).toContain('# Header 1');
  });

  it('should render h2 headers', () => {
    const result = renderMarkdown('## Header 2');
    expect(result).toContain('## Header 2');
  });

  it('should render unordered lists', () => {
    const result = renderMarkdown('- item 1\n- item 2');
    expect(result).toContain('item 1');
    expect(result).toContain('item 2');
  });

  it('should render links with URL', () => {
    const result = renderMarkdown('[Click here](https://example.com)');
    expect(result).toContain('Click here');
    expect(result).toContain('https://example.com');
  });

  it('should handle empty input', () => {
    const result = renderMarkdown('');
    expect(result).toBe('');
  });

  it('should handle multi-paragraph text', () => {
    const result = renderMarkdown('Paragraph 1\n\nParagraph 2');
    expect(result).toContain('Paragraph 1');
    expect(result).toContain('Paragraph 2');
  });
});
