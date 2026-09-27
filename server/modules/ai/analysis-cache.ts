import { eq } from 'drizzle-orm';
import { articleAnalysisSchema, type ArticleAnalysis } from '../../../shared/curation';
import { db } from '../../infrastructure/database/client';
import { articleAnalyses, articles } from '../../infrastructure/database/schema';

export function readAnalysis(key: string): ArticleAnalysis | undefined {
  const row = db.select().from(articleAnalyses).where(eq(articleAnalyses.key, key)).get();
  const parsed = articleAnalysisSchema.safeParse(row?.analysis);
  return parsed.success ? parsed.data : undefined;
}

export function writeAnalysis(key: string, articleId: string, analysis: ArticleAnalysis): void {
  // A feed can be deleted during a model call. The frozen run remains valid,
  // but no cache row should resurrect an article or violate its foreign key.
  if (!db.select({ id: articles.id }).from(articles).where(eq(articles.id, articleId)).get())
    return;
  db.insert(articleAnalyses)
    .values({ key, articleId, analysis, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}
