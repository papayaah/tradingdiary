import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGAGE_CONTENT,
  resolveEngageContent,
} from '@reactkits.dev/react-engage';
import { tradingDiaryEngageContent } from './engage-content';

describe('react-engage host content', () => {
  it('ships no package-owned placeholder FAQs', () => {
    expect(DEFAULT_ENGAGE_CONTENT.faq.items).toEqual([]);
  });

  it('deep-merges partial host copy without dropping defaults', () => {
    const content = resolveEngageContent({
      launcher: { title: 'Product Help' },
      feedback: { summaryPlaceholders: { bug: 'Describe the product issue' } },
    });

    expect(content.launcher.title).toBe('Product Help');
    expect(content.launcher.closeLabel).toBe('Close panel');
    expect(content.feedback.summaryPlaceholders.bug).toBe('Describe the product issue');
    expect(content.feedback.summaryPlaceholders.support).toBe('e.g. Question about my account');
  });

  it('keeps legacy flat labels working', () => {
    const content = resolveEngageContent(undefined, {
      launcherTitle: 'Ask Us',
      faqTabTitle: 'Guides',
    });

    expect(content.launcher.title).toBe('Ask Us');
    expect(content.tabs.faq).toBe('Guides');
  });

  it('lets the host own the complete FAQ catalog', () => {
    const content = resolveEngageContent(tradingDiaryEngageContent);

    expect(content.faq.items.length).toBeGreaterThan(0);
    expect(content.faq.items.some((item) => item.id === 'import-trades')).toBe(true);
    expect(content.faq.items.some((item) => item.id === 'data-storage')).toBe(true);
  });
});
