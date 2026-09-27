import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { HttpError } from '@daily-signal/domain/errors';
import { generateBenchmarkResult } from './recall-runner';
import { readBenchmarkJson, scoreRecall } from './recall';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      generate: { type: 'boolean' },
      out: { type: 'string' },
      help: { type: 'boolean' },
      check: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(`pnpm benchmark:recall                       离线示例计分（不代表模型质量）
pnpm benchmark:recall result.json           对实际结果计分
pnpm benchmark:recall result.json --check   验收基线，未达标时退出码为 1
pnpm benchmark:recall --generate --out /tmp/rss-result.json < connection.json
                                            调用真实模型；连接配置从 stdin 读取，可能产生费用`);
    return;
  }
  if (
    positionals.length > 1 ||
    (values.generate && positionals.length) ||
    (!values.generate && values.out)
  )
    throw new HttpError(400, '使用 --help 查看参数；--out 仅用于 --generate。');
  if (values.generate && !values.out)
    throw new HttpError(400, '--generate 需要 --out 保存可复查的结果。');

  // Open exclusively before making model calls, so a bad/existing output path fails without cost.
  let output: number | undefined;
  const outputPath = values.out ? resolve(projectRoot, values.out) : undefined;
  if (outputPath) output = openSync(outputPath, 'wx', 0o600);
  let saved = false;
  try {
    const result: unknown = values.generate
      ? await generateBenchmarkResult(JSON.parse(readFileSync(0, 'utf8')))
      : positionals[0]
        ? JSON.parse(readFileSync(resolve(projectRoot, positionals[0]), 'utf8'))
        : readBenchmarkJson('example-result.json');
    if (output !== undefined) writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    saved = true;
    const score = scoreRecall(result);
    if (score.kind === 'example') console.error('示例结果：仅演示计分，不是真实模型的召回率。');
    console.log(JSON.stringify(score, null, 2));
    if (values.check && !score.baseline.passed) process.exitCode = 1;
  } finally {
    if (output !== undefined) {
      closeSync(output);
      if (!saved && outputPath) rmSync(outputPath);
    }
  }
}

try {
  await main();
} catch (error) {
  // Zod/provider errors must not echo credentials or a raw request body.
  console.error(
    error instanceof z.ZodError
      ? '输入格式无效，请检查 README 中的结果或连接格式。'
      : error instanceof HttpError
        ? error.message
        : 'Benchmark 失败，请检查参数、输入 JSON、输出路径及模型配置（输出文件不可已存在）。',
  );
  process.exitCode = 1;
}
