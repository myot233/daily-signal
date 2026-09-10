import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderDigestTemplate, TemplateError, templateExampleContext as context, validateDigestTemplate } from '../shared/template';

test('plain Markdown is preserved and Liquid renders variables, filters, conditions and loops', () => {
  const plain = '# 技术日报\n\n- **事实**：A & B < C\n\n请保留来源。';
  assert.equal(renderDigestTemplate(plain, context), plain);
  assert.equal(renderDigestTemplate('{{ date }} / {{ articleCount }} / {{ model | upcase }}', context), '2026-09-10 / 2 / EXAMPLE-MODEL');
  assert.equal(renderDigestTemplate('{% if articleCount > 0 %}{% for article in articles %}{{ article.feedTitle }};{% endfor %}{% else %}暂无{% endif %}', context), '工程博客;开源动态;');
  assert.equal(renderDigestTemplate('{% if articleCount > 0 %}有文章{% else %}暂无{% endif %}', { ...context, articleCount: 0, articles: [] }), '暂无');
  assert.equal(renderDigestTemplate('{% raw %}{{ date }}{% endraw %}', context), '{{ date }}');
});

test('source strings are not interpreted as templates or HTML-escaped', () => {
  const title = '{{ apiKey }} & <release>';
  assert.equal(renderDigestTemplate('{{ articles[0].title }}', { ...context, articles: [{ ...context.articles[0]!, title }] }), title);
});

test('invalid syntax, missing variables and unknown filters return template errors', () => {
  assert.throws(() => validateDigestTemplate('{% if articleCount > 0 %}'), TemplateError);
  for (const template of ['{{ unknown }}', '{{ date | unknownFilter }}', '{{ articles[0].constructor }}', '{{ apiKey }}']) {
    assert.throws(() => renderDigestTemplate(template, { ...context, apiKey: 'NEVER-EXPOSE' } as typeof context), TemplateError);
  }
});

test('templates cannot load files, access prototypes or exceed rendering limits', () => {
  for (const template of [
    '{% include "package.json" %}', '{% render "package.json" %}', '{% layout "package.json" %}',
    '{% include "constructor" %}', '{% include "https://example.com/template" %}',
    '{{ articles.constructor }}', 'x'.repeat(12_001),
    '{% for i in (1..1000000000) %}x{% endfor %}',
    '{% for i in (1..4) %}' + 'x'.repeat(8_000) + '{% endfor %}',
  ]) assert.throws(() => renderDigestTemplate(template, context), TemplateError);
});
