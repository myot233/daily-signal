import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { articleFilterSchema } from '@daily-signal/domain';
process.env.DATABASE_PATH = ':memory:';
const { db, sqlite } = await import('@daily-signal/database');
const { feeds, articles } = await import('@daily-signal/database/schema');
const { listArticles, listFeeds, updateArticle, updateFeed, markArticlesRead } =
  await import('./repository');
const { createFeedService, exportOpml } = await import('./service');
after(() => sqlite.close());
beforeEach(() => db.delete(feeds).run());
const date = '2026-09-30T08:00:00.000Z';
function seed() {
  for (const [id, category] of [
    ['engineering', '工程'],
    ['design', '设计'],
  ]) {
    db.insert(feeds)
      .values({ id, category, title: id!, url: `https://${id}.example.com/rss`, createdAt: date })
      .run();
  }
  for (const [id, feedId, title, content] of [
    ['one', 'engineering', 'REACT 工程', '中文正文'],
    ['two', 'engineering', '第二篇', 'React 组件'],
    ['three', 'design', 'React 设计', '设计正文'],
  ])
    db.insert(articles)
      .values({
        id: id!,
        feedId: feedId!,
        title: title!,
        content: content!,
        url: `https://example.com/${id}`,
        publishedAt: date,
      })
      .run();
}
test('reading and favorites persist independently, unread counts include empty feeds', () => {
  seed();
  db.insert(feeds)
    .values({ id: 'empty', title: 'Empty', url: 'https://empty.example.com/rss', createdAt: date })
    .run();
  assert.equal(listFeeds().find((feed) => feed.id === 'engineering')!.unreadCount, 2);
  assert.equal(listFeeds().find((feed) => feed.id === 'empty')!.unreadCount, 0);
  const read = updateArticle({ id: 'one', read: true });
  assert.ok(read.readAt);
  assert.equal(read.starred, false);
  const starred = updateArticle({ id: 'one', starred: true });
  assert.equal(starred.readAt, read.readAt);
  assert.equal(starred.starred, true);
  const unread = updateArticle({ id: 'one', read: false });
  assert.equal(unread.readAt, null);
  assert.equal(unread.starred, true);
  assert.equal(listFeeds().find((feed) => feed.id === 'engineering')!.unreadCount, 2);
  assert.throws(() => updateArticle({ id: 'missing', read: true }), { status: 404 });
});
test('bulk actions share title/content, source, category, state and favorite matching, including older cached articles', () => {
  seed();
  updateArticle({ id: 'one', starred: true });
  const filter = articleFilterSchema.parse({
    category: '工程',
    query: 'rEaCt',
    status: 'unread',
    starredOnly: true,
  });
  assert.deepEqual(markArticlesRead({ filter, read: true }), { updated: 1 });
  assert.ok(listArticles().find((article) => article.id === 'one')!.readAt);
  assert.equal(listArticles().find((article) => article.id === 'two')!.readAt, null);
  assert.equal(listArticles().find((article) => article.id === 'three')!.readAt, null);
  assert.deepEqual(markArticlesRead({ filter, read: true }), { updated: 0 });
  assert.deepEqual(
    markArticlesRead({ filter: articleFilterSchema.parse({ feedId: 'missing' }), read: true }),
    { updated: 0 },
  );
  for (let index = 0; index < 820; index++)
    db.insert(articles)
      .values({
        id: `old-${index}`,
        feedId: 'engineering',
        title: '旧文章',
        content: '缓存内容',
        url: `https://example.com/old-${index}`,
        publishedAt: '2020-01-01T00:00:00.000Z',
      })
      .run();
  assert.equal(listArticles().length, 823);
  assert.deepEqual(
    markArticlesRead({
      filter: articleFilterSchema.parse({ feedId: 'engineering', query: '旧文章' }),
      read: true,
    }),
    { updated: 820 },
  );
  assert.equal(listFeeds().find((feed) => feed.id === 'engineering')!.unreadCount, 1);
  assert.deepEqual(
    markArticlesRead({ filter: articleFilterSchema.parse({ status: 'read' }), read: false }),
    { updated: 821 },
  );
});
test('refresh preserves custom feed name, category, reading state and favorites, while new articles are unread', async () => {
  let extra = '';
  const service = createFeedService({
    fetchText: async () => ({
      ok: true,
      status: 200,
      text: `<rss version="2.0"><channel><title>Upstream name</title><link>https://news.example.com</link><description>News</description><item><title>Original</title><link>https://news.example.com/one</link></item>${extra}</channel></rss>`,
    }),
  });
  const feed = await service.addFeed('https://news.example.com/rss', '旧分组');
  const original = listArticles()[0]!;
  updateArticle({ id: original.id, read: true, starred: true });
  const updated = updateFeed({ id: feed.id, title: '我的新闻', category: '新闻' });
  assert.equal(updated.title, '我的新闻');
  extra = '<item><title>New</title><link>https://news.example.com/two</link></item>';
  await service.refreshFeeds();
  const saved = listFeeds()[0]!;
  assert.equal(saved.title, '我的新闻');
  assert.equal(saved.category, '新闻');
  assert.equal(saved.articleCount, 2);
  assert.equal(saved.unreadCount, 1);
  const existing = listArticles().find((article) => article.id === original.id)!;
  assert.ok(existing.readAt);
  assert.equal(existing.starred, true);
  assert.equal(existing.feedTitle, '我的新闻');
  assert.equal(listArticles().find((article) => article.id !== original.id)!.readAt, null);
  assert.match(exportOpml(), /我的新闻/);
  assert.match(exportOpml(), /新闻/);
  assert.throws(() => updateFeed({ id: 'missing', title: '新闻', category: '' }), { status: 404 });
});
