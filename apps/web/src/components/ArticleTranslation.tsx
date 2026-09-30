import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Languages, LoaderCircle } from 'lucide-react';
import type { TranslationInput, TranslationResult } from '@daily-signal/domain';
import { errorMessage } from '@daily-signal/client';
import { Button } from '@daily-signal/ui/button';

export type TranslateArticle = (
  input: TranslationInput,
  signal: AbortSignal,
) => Promise<TranslationResult>;
export type TranslationModel = { id: string; revision: number; label: string };

type ArticleTranslationProps = {
  articleId: string;
  content: string;
  model: TranslationModel | null;
  translate: TranslateArticle;
  onConfigure: () => void;
};

export function ArticleTranslation({
  articleId,
  content,
  model,
  translate,
  onConfigure,
}: ArticleTranslationProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['article-translation', articleId, content, model?.id, model?.revision];
  const translation = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      if (!model) throw new Error('请先配置默认模型及 API Key。');
      return translate({ content, providerModelId: model.id }, signal);
    },
    enabled: false,
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    networkMode: 'always',
  });

  return (
    <>
      <div className="mt-5 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="正文语言">
          {translation.data ? (
            <>
              <Button
                size="sm"
                variant={!showTranslation ? 'secondary' : 'ghost'}
                aria-pressed={!showTranslation}
                onClick={() => setShowTranslation(false)}
              >
                原文
              </Button>
              <Button
                size="sm"
                variant={showTranslation ? 'secondary' : 'ghost'}
                aria-pressed={showTranslation}
                onClick={() => setShowTranslation(true)}
              >
                中文译文
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!model || translation.isFetching}
              onClick={() => {
                setShowTranslation(true);
                void translation.refetch({ cancelRefetch: false });
              }}
            >
              {translation.isFetching ? <LoaderCircle className="animate-spin" /> : <Languages />}
              {translation.isFetching
                ? '正在翻译…'
                : translation.isError
                  ? '重试翻译'
                  : 'AI 翻译为中文'}
            </Button>
          )}
          {translation.isFetching && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void queryClient.cancelQueries({ queryKey, exact: true })}
            >
              取消翻译
            </Button>
          )}
          {!model && (
            <Button size="sm" variant="ghost" onClick={onConfigure}>
              配置默认模型
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground wrap-anywhere">
          {translation.data
            ? `AI 译文 · ${translation.data.providerName} / ${translation.data.model} · 请以原文为准`
            : model
              ? `使用 ${model.label}，点击后将发送缓存正文并产生模型调用费用。`
              : '请先设置可用的默认模型并保存 API Key。'}
        </p>
        {translation.isFetching && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            正在翻译缓存正文，原文仍可阅读。
          </p>
        )}
        {translation.isError && (
          <p role="alert" className="mt-2 text-sm text-destructive wrap-anywhere">
            {errorMessage(translation.error)}
          </p>
        )}
      </div>
      <div
        className="mt-7 whitespace-pre-wrap text-base leading-[1.8] wrap-anywhere"
        aria-label={showTranslation && translation.data ? '中文译文' : '订阅原文'}
      >
        {showTranslation && translation.data ? translation.data.text : content}
      </div>
    </>
  );
}
