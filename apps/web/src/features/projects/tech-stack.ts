import {
  ArrowLeftRight,
  Bot,
  Boxes,
  Code2,
  Cpu,
  Database,
  Dog,
  FileText,
  ListTodo,
  Lock,
  Monitor,
  Newspaper,
  PenLine,
  Play,
  Route,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
  Wrench,
} from '@lucide/vue';
import {
  siAnthropic,
  siApacheecharts,
  siCommitlint,
  siDocker,
  siEslint,
  siFastify,
  siGsap,
  siLucide,
  siMinio,
  siMongodb,
  siMongoose,
  siNestjs,
  siNginx,
  siNodedotjs,
  siNuxt,
  siPassport,
  siPinia,
  siPino,
  siPnpm,
  siPrettier,
  siRedis,
  siRekaui,
  siSocketdotio,
  siSwagger,
  siTailwindcss,
  siTanstack,
  siTurborepo,
  siTypescript,
  siVite,
  siVitest,
  siVuedotjs,
  siZod,
} from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import type { Component } from 'vue';

/** 有官方图标（simple-icons）的技术 */
export interface TechWithIcon {
  name: string;
  si: SimpleIcon;
}

/** 无官方图标的技术，用 lucide 图标兜底 */
export interface TechWithFallback {
  name: string;
  fallback: Component;
}

export type TechItem = TechWithIcon | TechWithFallback;

export interface TechSubGroup {
  label: string;
  items: TechItem[];
}

export interface TechGroup {
  id: string;
  label: string;
  icon: Component;
  /** 组内再分子类（树形第二层） */
  subGroups?: TechSubGroup[];
  /** 无子类时直接平铺技术 */
  items?: TechItem[];
}

const icon = (si: SimpleIcon): TechWithIcon => ({ name: si.title, si });
const fb = (name: string, fallback: Component): TechWithFallback => ({ name, fallback });

/** Personal OS 当前采用的技术栈（树形结构：分组 → 子类 → 技术） */
export const techTree: TechGroup[] = [
  {
    id: 'web',
    label: '前端 Web',
    icon: Monitor,
    subGroups: [
      {
        label: '核心框架',
        items: [icon(siVuedotjs), icon(siVite), fb('Vue Router', Route), icon(siPinia)],
      },
      {
        label: 'UI 与动画',
        items: [
          icon(siTailwindcss),
          icon(siRekaui),
          icon(siLucide),
          fb('Motion', Sparkles),
          icon(siGsap),
        ],
      },
      {
        label: '数据与实时',
        items: [icon(siTanstack), fb('ofetch', ArrowLeftRight), icon(siZod), icon(siSocketdotio)],
      },
      {
        label: '可视化与编辑',
        items: [
          icon(siApacheecharts),
          fb('Vue Flow', Workflow),
          fb('Tiptap', PenLine),
          fb('Monaco Editor', Code2),
        ],
      },
      {
        label: '内容处理',
        items: [fb('Marked', FileText), fb('DOMPurify', ShieldCheck)],
      },
    ],
  },
  {
    id: 'blog',
    label: '博客',
    icon: Newspaper,
    items: [icon(siNuxt), fb('@nuxtjs/seo', Search)],
  },
  {
    id: 'api',
    label: 'API',
    icon: Server,
    items: [
      icon(siNestjs),
      icon(siFastify),
      icon(siSwagger),
      icon(siMongodb),
      icon(siMongoose),
      icon(siRedis),
      fb('ioredis', Database),
      fb('BullMQ', ListTodo),
      icon(siPassport),
      fb('bcrypt', Lock),
      icon(siZod),
      icon(siPino),
      icon(siSocketdotio),
    ],
  },
  {
    id: 'worker',
    label: 'Worker',
    icon: Cpu,
    items: [
      icon(siNodedotjs),
      fb('BullMQ', ListTodo),
      fb('OpenAI', Bot),
      icon(siAnthropic),
      icon(siZod),
    ],
  },
  {
    id: 'tooling',
    label: '工程化',
    icon: Wrench,
    items: [
      icon(siPnpm),
      icon(siTurborepo),
      icon(siTypescript),
      icon(siEslint),
      icon(siPrettier),
      fb('Husky', Dog),
      icon(siCommitlint),
      icon(siVitest),
      fb('Playwright', Play),
    ],
  },
  {
    id: 'infra',
    label: '基础设施',
    icon: Boxes,
    items: [icon(siDocker), icon(siMongodb), icon(siRedis), icon(siMinio), icon(siNginx)],
  },
];
