#!/usr/bin/env node
/**
 * frontmatter 校验 CLI（零依赖）。
 *
 * 镜像 server/utils/posts.ts 的同一套校验语义（必填字段 / 日期格式 / slug 规则与唯一性 /
 * draft 布尔 / tags 非空），让作者在编辑器写完文章后**不启动 dev server** 即可显式校验：
 *
 *   node scripts/validate-posts.mjs            # 校验默认目录 content/posts
 *   node scripts/validate-posts.mjs <dir>      # 校验指定目录
 *
 * 退出码：0 = 全部通过；1 = 存在错误（错误逐条输出，便于定位）。
 * 注意：本脚本刻意不引用 posts.ts（避免 nitro/import.meta 运行时依赖），规则如有变更
 * 需两处同步；posts.spec 负责数据层语义，本 CLI 负责作者侧快速反馈。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const defaultDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../content/posts');

const targetDir = process.argv[2] ? resolve(process.argv[2]) : defaultDir;

/** 解析 frontmatter 为原始键值（镜像 posts.ts 的 parseFrontmatter 核心）。 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  const problems = [];
  if (lines[0]?.trim() !== '---') {
    problems.push('文件必须以 --- 开头（缺少 frontmatter 起始标记）');
    return { meta: {}, problems };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) {
    problems.push('frontmatter 未闭合（缺少结束 --- 标记）');
    return { meta: {}, problems };
  }

  const meta = {};
  const fmLines = lines.slice(1, endIndex);
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const match = /^([A-Za-z]+):(.*)$/.exec(line);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1];
    const rest = match[2].trim();
    if (key === 'tags' && rest === '') {
      const items = [];
      i += 1;
      while (i < fmLines.length && /^\s+-\s+/.test(fmLines[i])) {
        items.push(
          fmLines[i]
            .trim()
            .replace(/^-\s+/, '')
            .replace(/^["']|["']$/g, ''),
        );
        i += 1;
      }
      meta.tags = items;
      continue;
    }
    if (rest === '') {
      i += 1;
      continue;
    }
    if (key === 'tags') {
      meta.tags = rest
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((t) => t.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = rest.replace(/^["']|["']$/g, '');
    }
    i += 1;
  }
  return { meta, problems };
}

/** 单个文件校验，返回问题数组（空 = 通过）。 */
function validateFile(file) {
  const problems = [];
  const raw = readFileSync(resolve(targetDir, file), 'utf8');
  const { meta, problems: parseProblems } = parseFrontmatter(raw);
  problems.push(...parseProblems);
  if (parseProblems.length > 0) {
    return problems;
  }

  const label = (key) =>
    ({ title: 'title', description: 'description', date: 'date', category: 'category' })[key] ??
    key;

  for (const key of ['title', 'description', 'date', 'category']) {
    const value = meta[key];
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`frontmatter 缺少必填字段 ${label(key)}`);
    }
  }
  for (const key of ['date', 'updated']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim() !== '' && !DATE_RE.test(value.trim())) {
      problems.push(`frontmatter 字段 ${key} 格式错误（应为 YYYY-MM-DD，实际: ${value}）`);
    }
  }

  const fileNameSlug = file.slice(0, -3);
  if (!SLUG_RE.test(fileNameSlug)) {
    problems.push(`文件名不是合法 slug（须匹配 ${SLUG_RE.source}）`);
  }
  if (meta.slug !== undefined) {
    if (typeof meta.slug !== 'string' || !SLUG_RE.test(meta.slug)) {
      problems.push(`frontmatter 字段 slug 非法（须匹配 ${SLUG_RE.source}，实际: ${meta.slug}）`);
    }
  }

  if (meta.draft !== undefined && !['true', 'false'].includes(String(meta.draft))) {
    problems.push(`frontmatter 字段 draft 应为 true/false（实际: ${meta.draft}）`);
  }

  if (
    !Array.isArray(meta.tags) ||
    meta.tags.length === 0 ||
    meta.tags.some((t) => typeof t !== 'string' || t.trim() === '')
  ) {
    problems.push('frontmatter 缺少必填字段 tags（非空数组）');
  }

  return problems;
}

let files;
try {
  files = readdirSync(targetDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
} catch (error) {
  console.error(`✗ 内容目录不可读: ${targetDir}（${error.message}）`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`✗ 内容目录为空: ${targetDir}`);
  process.exit(1);
}

const perFile = new Map();
for (const file of files) {
  const problems = validateFile(file);
  if (problems.length > 0) {
    perFile.set(file, problems);
  }
}

// slug 唯一性（跨文件，含 frontmatter 覆盖）：镜像 posts.ts 的冲突检测
const slugOwner = new Map();
for (const file of files) {
  const raw = readFileSync(resolve(targetDir, file), 'utf8');
  const { meta } = parseFrontmatter(raw);
  const slug = typeof meta.slug === 'string' ? meta.slug : file.slice(0, -3);
  const owner = slugOwner.get(slug);
  if (owner) {
    const msg = `slug 冲突: ${owner} 与 ${file} 都解析为 "${slug}"`;
    perFile.set(file, [...(perFile.get(file) ?? []), msg]);
    perFile.set(owner, [...(perFile.get(owner) ?? []), msg]);
  } else {
    slugOwner.set(slug, file);
  }
}

let failed = 0;
for (const file of files) {
  const problems = perFile.get(file) ?? [];
  if (problems.length === 0) {
    console.log(`✓ ${file}`);
  } else {
    failed += 1;
    console.log(`✗ ${file}: ${problems.length} 个问题`);
    for (const p of problems) {
      console.log(`    - ${p}`);
    }
  }
}

console.log('');
if (failed === 0) {
  console.log(`全部通过：${files.length} 篇文章校验 OK（${targetDir}）`);
  process.exit(0);
}
console.error(`校验失败：${failed}/${files.length} 篇文章存在错误（${targetDir}）`);
process.exit(1);
