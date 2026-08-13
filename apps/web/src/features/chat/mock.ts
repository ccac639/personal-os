/**
 * Chat 功能域 —— 本地模拟回复
 *
 * 当前阶段未接入后端 LLM，使用本地模板生成"看起来像模像样"的回复，
 * 用于打磨前端交互体验（流式输出 / 代码高亮 / Markdown 渲染）。
 * 后续接入 API 后，将本模块替换为真实请求即可。
 *
 * mockReply 按「输出模式 + 当前模型 + 回复长度」返回不同但确定性的演示内容，
 * 由 ChatReplyService 透传上下文。
 */
import { CHAT_MODELS, modelById } from './models';
import type { ChatModelOption, ChatOutputMode, ChatReplyLength } from './types';

export { CHAT_MODELS };

export function modelLabel(id: string): string {
  return modelById(id)?.label ?? id;
}

/** 模板变体序号：让"重新生成"得到不同回复（确定性循环） */
let variantSeq = 0;

function codeBlock(lang: string, code: string): string {
  return '```' + lang + '\n' + code + '\n```';
}

function replyForCode(mode: ChatOutputMode): string {
  const variants = [
    {
      head: '可以，下面是一个 Vue 3 + TypeScript 的组合式组件示例，注意 `defineProps` 与 `defineEmits` 的用法：',
      code: [
        '<script setup lang="ts">',
        'const props = defineProps<{ title: string; count?: number }>();',
        '',
        "const emit = defineEmits<{ (e: 'update', value: number): void }>();",
        '',
        'function inc() {',
        "  emit('update', (props.count ?? 0) + 1);",
        '}',
        '</script>',
      ].join('\n'),
      tail: '实现要点：\n\n1. **类型优先**：props / emits 全部用泛型约束，避免运行时校验开销\n2. **单一职责**：组件只负责展示与交互，数据请求放到 composable\n3. **命名规范**：事件名用 kebab-case 对齐 DOM 习惯',
    },
    {
      head: '这类场景建议拆成三层：状态层 → 服务层 → 视图层。先看服务层的封装：',
      code: [
        'export interface TodoItem {',
        '  id: string;',
        '  title: string;',
        '  done: boolean;',
        '}',
        '',
        "export async function fetchTodos(): Promise<TodoItem[]> {",
        "  return apiFetch<TodoItem[]>('/todos');",
        '}',
        '',
        'export async function toggleTodo(id: string): Promise<TodoItem> {',
        "  return apiFetch<TodoItem>(`/todos/${id}/toggle`, { method: 'PATCH' });",
        '}',
      ].join('\n'),
      tail: '调用侧配合缓存层管理请求：\n\n- 读取与写入分离，key 稳定、自动去重\n- 成功后刷新列表，错误由查询层统一处理\n- 组件内不再散落 try/catch',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  const tailLead = v.tail.split('\n\n')[0] ?? '';
  const modeHead =
    mode === 'image'
      ? '从代码视角看，这个提示词的结构可以这样表达：'
      : mode === 'writing'
        ? '从写作视角看，这段代码的说明可以这样组织：'
        : '';
  return (
    '## 实现思路\n\n' +
    (modeHead ? modeHead + '\n\n' : '') +
    v.head +
    '\n\n' +
    codeBlock(v.code.startsWith('<') ? 'vue' : 'ts', v.code) +
    '\n\n> ' +
    tailLead +
    '\n\n' +
    v.tail.replace(tailLead, '')
  );
}

function replyForWorkflow(): string {
  const variants = [
    {
      head: '可以把这条链路编排成一个**工作流**，关键节点如下：',
      steps: [
        '**触发**：文件变更 / 定时 / 手动',
        '**处理**：格式校验 → 依赖审计 → 构建',
        '**决策**：风险评分决定发布 or 回滚',
        '**通知**：结果推送到聊天与看板',
      ],
      tail: '建议先用 7 步流程做编排，再沉淀为可复用模板。',
    },
    {
      head: '自动化链路的推荐拆法（事件驱动，解耦各环节）：',
      steps: [
        '**事件总线**：统一收口 git / 定时器 / webhook 触发',
        '**执行器**：每个任务独立沙箱，失败可重试',
        '**状态机**：pending → running → success / failed，全程可观测',
        '**回滚**：保留上一版本快照，一键恢复',
      ],
      tail: '重点是**幂等设计**：每个步骤重复执行结果一致，断点续跑才不会出问题。',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  return (
    '## 工作流设计\n\n' +
    v.head +
    '\n\n' +
    v.steps.map((s) => '- ' + s).join('\n') +
    '\n\n> ' +
    v.tail
  );
}

function replyForArchitecture(): string {
  const variants = [
    {
      head: '结合当前 monorepo（pnpm workspace + Turborepo），推荐这样分层：',
      layers: [
        '**apps/**：可独立部署的应用（web / api / worker / blog）',
        '**packages/**：跨应用共享的内部库（ui / utils / types / config）',
        '**infrastructure/**：部署与运维（docker-compose / CI 编排）',
      ],
      tail: '核心原则：**依赖单向**——packages 不得反向依赖 apps；共享类型统一收口，避免跨包复制类型。',
    },
    {
      head: '从当前健康度看，两个优先优化点：\n\n1. **API 层收敛**：统一客户端与校验，错误结构标准化\n2. **共享组件下沉**：重复的卡片/表格抽象进共享包，用版本管理\n\n建议演进路径：',
      layers: [
        '**阶段一**：类型与校验下沉（收益最高，风险最低）',
        '**阶段二**：UI 组件按依赖层级分批迁移',
        '**阶段三**：worker 独立部署，通过消息队列与 API 解耦',
      ],
      tail: '每次迁移记录背景与回滚方案，变更可追溯。',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  return (
    '## 架构建议\n\n' +
    v.head +
    '\n\n' +
    v.layers.map((l) => '- ' + l).join('\n') +
    '\n\n> ' +
    v.tail
  );
}

function replyForReview(): string {
  const variants = [
    {
      head: '这是一份本周项目的复盘摘要：',
      items: [
        '**完成**：聊天工作区界面、代码索引增量更新、网盘 Skill 接入',
        '**阻塞**：社区源索引不稳定，Skill 安装改走官方发布包',
        '**风险**：依赖数量持续增长，建议下周跑一次依赖审计',
      ],
      tail: '建议把"安装来源"固化为文档，下次遇到源抖动直接走备选路径。',
    },
    {
      head: '根据仓库最近的活动，我注意到：',
      items: [
        '**热点**：前端变更最频繁，UI 层迭代进入快车道',
        '**负债**：部分占位页面尚未实现，待办中标记为高优先级',
        '**机会**：看板数据流可以复用为聊天模块的会话统计',
      ],
      tail: '建议按健康度六维评分每周复查，把技术债量化跟踪。',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  return (
    '## 复盘与建议\n\n' +
    v.head +
    '\n\n' +
    v.items.map((i) => '- ' + i).join('\n') +
    '\n\n> ' +
    v.tail
  );
}

/** 图像提示词模式：结构化提示词模板 */
function replyForImagePrompt(input: string): string {
  const variants = [
    {
      head: '把「' + input.trim() + '」拆成结构化提示词：',
      sections: [
        '**主体**：核心对象与动作，越具体越好',
        '**环境**：场景、光线、时间氛围',
        '**风格**：媒介、画风、参考方向',
        '**构图**：景别、角度、焦点',
        '**负面词**：需要避免的元素',
      ],
      tail: '生成时按「主体 → 环境 → 风格 → 构图 → 负面词」的顺序排列，效果最稳定。',
    },
    {
      head: '这是一版可直接使用的图像提示词模板（套用你的主题）：',
      sections: [
        '**Prompt**：`' +
          input.trim() +
          ', 电影感光线, 高细节, 8K`',
        '**Negative**：`模糊, 低分辨率, 多余肢体, 文字水印`',
        '**参数建议**：步数 30，CFG 7，分辨率按目标比例',
      ],
      tail: '同一主体换「风格」关键词即可快速产出多组变体。',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  return (
    '## 图像提示词\n\n' +
    v.head +
    '\n\n' +
    v.sections.map((s) => '- ' + s).join('\n') +
    '\n\n> ' +
    v.tail
  );
}

/** 创作模式：长文骨架 */
function replyForWriting(input: string): string {
  const variants = [
    {
      head: '围绕「' + input.trim() + '」先搭一个写作骨架：',
      sections: [
        '**开头**：一句话点明主题与读者收益',
        '**背景**：为什么现在值得关注',
        '**主体**：2-3 个递进小节，每节一个小标题',
        '**收尾**：行动建议或总结句',
      ],
      tail: '先写骨架再填充细节，段落之间保持一个核心观点。',
    },
    {
      head: '这篇内容建议按「总分总」组织：',
      sections: [
        '**总**：开门见山，30 字内说清结论',
        '**分**：每段只讲一件事，配一个小例子',
        '**总**：复述收益 + 下一步动作',
      ],
      tail: '语气保持平实，避免堆砌形容词；短句更利于阅读。',
    },
  ];
  const v = variants[variantSeq % variants.length]!;
  return (
    '## 写作框架\n\n' +
    v.head +
    '\n\n' +
    v.sections.map((s) => '- ' + s).join('\n') +
    '\n\n> ' +
    v.tail
  );
}

function applyLength(text: string, length: ChatReplyLength): string {
  if (length === 'short') {
    // 只保留标题与首段（按行切分，确定性截断）
    const lines = text.split('\n');
    const keep: string[] = [];
    for (const line of lines) {
      keep.push(line);
      if (line.startsWith('>') && keep.length > 2) break;
    }
    return keep.join('\n');
  }
  if (length === 'detailed') {
    return (
      text +
      '\n\n---\n\n> 已按「详细」档位展开。如需要，我可以进一步补充示例、边界情况与反例。'
    );
  }
  return text;
}

export interface MockReplyContext {
  mode?: ChatOutputMode;
  model?: string;
  replyLength?: ChatReplyLength;
  /** 会话级系统提示词（透传 preset 名称与文本，仅影响署名注释） */
  systemPrompt?: string;
  presetName?: string;
  /** 智能体上下文（启动智能体后的会话） */
  agentId?: string;
  agentName?: string;
}

/** 根据用户输入生成一条模拟回复（含 Markdown 结构，用于展示渲染效果） */
export function mockReply(input: string, ctx: MockReplyContext = {}): string {
  variantSeq += 1;
  const mode = ctx.mode ?? 'chat';
  const length = ctx.replyLength ?? 'standard';
  const model = ctx.model ? modelById(ctx.model) : undefined;
  const text = input.toLowerCase();

  let reply: string;
  if (mode === 'image') {
    reply = replyForImagePrompt(input);
  } else if (mode === 'writing') {
    reply = replyForWriting(input);
  } else if (/(vue|代码|组件|函数|接口|api|typescript|ts\b|前端)/.test(text)) {
    reply = replyForCode(mode);
  } else if (/(工作流|workflow|自动化|编排|流水线)/.test(text)) {
    reply = replyForWorkflow();
  } else if (/(架构|设计|重构|分层|monorepo|微服务)/.test(text)) {
    reply = replyForArchitecture();
  } else if (/(复盘|总结|review|汇报|周报)/.test(text)) {
    reply = replyForReview();
  } else {
    reply =
      '## 收到\n\n你问的是：**' +
      input.trim() +
      '**\n\n当前阶段这是本地模拟回复，用于打磨前端交互体验。接入真实 LLM 后，这里会返回流式推理结果。\n\n' +
      '**接下来可以试试：**\n\n- 问一个 Vue / TypeScript 的代码问题\n- 让我帮你设计一条工作流\n- 聊聊项目架构演进\n\n' +
      '> 提示：回复支持 Markdown 渲染，代码块会自动高亮。';
  }

  const result = applyLength(reply, length);
  // 确定性署名：说明当前模型与输出模式（演示 service 上下文透传）
  const modelName = model?.label ?? '通用推理';
  const modeNote =
    mode === 'image' ? '图像提示词' : mode === 'writing' ? '写作' : mode === 'code' ? '代码' : '对话';
  const promptNote =
    ctx.systemPrompt && ctx.systemPrompt.trim()
      ? ` · 已应用提示词（${ctx.presetName ?? '自定义'}）`
      : '';
  const agentNote = ctx.agentName ? ` · 智能体「${ctx.agentName}」` : '';
  return result + `\n\n---\n\n*由 ${modelName}（${modeNote}）生成 · 本地演示${promptNote}${agentNote}*`;
}

export type { ChatModelOption };
