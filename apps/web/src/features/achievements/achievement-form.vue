<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Plus, Trash2, X } from '@lucide/vue';
import { ACHIEVEMENT_TYPES, TYPE_META } from './constants';
import { useOverlayFocus } from './overlay';
import { splitTags, validateDraft } from './validation';
import type { DraftErrors } from './validation';
import type {
  Achievement,
  AchievementDraft,
  AchievementMetric,
  AchievementType,
  LinkItem,
} from './types';

const props = defineProps<{
  visible: boolean;
  /** null = 新增 */
  item: Achievement | null;
  /** 关联项目选项（只读引用 projects 模块） */
  projectOptions: { id: string; name: string }[];
  /** 关联工作流选项（只读引用 workflows 模块） */
  workflowOptions: { id: string; name: string }[];
  /** 前置/衍生成果候选（全部成果，排除自身） */
  allItems: Achievement[];
}>();

const emit = defineEmits<{
  close: [];
  submit: [draft: AchievementDraft];
}>();

const panel = ref<HTMLElement | null>(null);

// 统一焦点管理：不抢焦点（保留触发元素），关闭后归还；Escape 关闭；Tab 陷阱；滚动锁定
useOverlayFocus({
  visible: () => props.visible,
  onEscape: () => emit('close'),
  container: panel,
});

/* ---------- 表单状态 ---------- */
const type = ref<AchievementType>('project');
const title = ref('');
const summary = ref('');
const description = ref('');
const tagsText = ref('');
const relatedProject = ref('');
const completedAt = ref('');
const link = ref('');
const metrics = ref<AchievementMetric[]>([{ label: '', value: '' }]);

/* 关系（仅存本地引用 ID） */
const projectIds = ref<string[]>([]);
const workflowIds = ref<string[]>([]);
const predecessorIds = ref<string[]>([]);
const derivedIds = ref<string[]>([]);

/* 复用包 */
const links = ref<LinkItem[]>([{ label: '', url: '' }]);
const usageGuide = ref('');
const checklistText = ref('');
const retrospective = ref('');
const templateSnippet = ref('');

/** 字段级错误：提交时校验，输入时清除对应字段错误 */
const errors = reactive<DraftErrors>({});

function emptyMetrics(): AchievementMetric[] {
  return [{ label: '', value: '' }];
}

function emptyLinks(): LinkItem[] {
  return [{ label: '', url: '' }];
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** 打开时初始化表单：编辑填充 / 新增重置 */
watch(
  () => props.visible,
  (open) => {
    if (!open) return;
    Object.keys(errors).forEach((k) => delete errors[k as keyof DraftErrors]);
    const item = props.item;
    if (item) {
      type.value = item.type;
      title.value = item.title;
      summary.value = item.summary;
      description.value = item.description;
      tagsText.value = item.tags.join('，');
      relatedProject.value = item.relatedProject ?? '';
      completedAt.value = item.completedAt;
      link.value = item.link ?? '';
      metrics.value =
        item.metrics.length > 0 ? item.metrics.map((m) => ({ ...m })) : emptyMetrics();
      projectIds.value = [...item.relations.projectIds];
      workflowIds.value = [...item.relations.workflowIds];
      predecessorIds.value = [...item.relations.predecessorIds];
      derivedIds.value = [...item.relations.derivedIds];
      links.value =
        item.reuse.links.length > 0 ? item.reuse.links.map((l) => ({ ...l })) : emptyLinks();
      usageGuide.value = item.reuse.usageGuide;
      checklistText.value = item.reuse.checklist.join('\n');
      retrospective.value = item.reuse.retrospective;
      templateSnippet.value = item.reuse.templateSnippet;
    } else {
      type.value = 'project';
      title.value = '';
      summary.value = '';
      description.value = '';
      tagsText.value = '';
      relatedProject.value = '';
      completedAt.value = '';
      link.value = '';
      metrics.value = emptyMetrics();
      projectIds.value = [];
      workflowIds.value = [];
      predecessorIds.value = [];
      derivedIds.value = [];
      links.value = emptyLinks();
      usageGuide.value = '';
      checklistText.value = '';
      retrospective.value = '';
      templateSnippet.value = '';
    }
  },
);

function addMetric() {
  if (metrics.value.length >= 4) return;
  metrics.value.push({ label: '', value: '' });
}

function removeMetric(index: number) {
  metrics.value = metrics.value.filter((_, i) => i !== index);
}

function addLink() {
  if (links.value.length >= 10) return;
  links.value.push({ label: '', url: '' });
}

function removeLink(index: number) {
  links.value = links.value.filter((_, i) => i !== index);
}

function clearError(key: keyof DraftErrors) {
  delete errors[key];
}

/* ---------- 关系选择（chip 多选） ---------- */

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** 候选：选项去掉已选，避免重复添加 */
function candidateOf(
  options: { id: string; name: string }[],
  selected: string[],
): { id: string; name: string }[] {
  const set = new Set(selected);
  return options.filter((o) => !set.has(o.id));
}

function submit() {
  const draft: AchievementDraft = {
    type: type.value,
    title: title.value.trim(),
    summary: summary.value.trim(),
    description: description.value.trim(),
    tags: splitTags(tagsText.value),
    relatedProject: relatedProject.value.trim() || undefined,
    completedAt: completedAt.value.trim(),
    link: link.value.trim() || undefined,
    metrics: metrics.value.filter((m) => m.label.trim() && m.value.trim()),
    relations: {
      projectIds: [...new Set(projectIds.value)],
      workflowIds: [...new Set(workflowIds.value)],
      predecessorIds: [...new Set(predecessorIds.value)],
      derivedIds: [...new Set(derivedIds.value)],
    },
    reuse: {
      links: links.value.filter((l) => l.label.trim() && l.url.trim()),
      usageGuide: usageGuide.value.trim(),
      checklist: splitLines(checklistText.value),
      retrospective: retrospective.value.trim(),
      templateSnippet: templateSnippet.value.trim(),
    },
  };
  const next = validateDraft(draft);
  Object.keys(errors).forEach((k) => delete errors[k as keyof DraftErrors]);
  Object.assign(errors, next);
  if (Object.keys(errors).length > 0) return;
  emit('submit', draft);
}

const inputCls =
  'w-full rounded-lg border bg-surface-50/60 px-3 py-2 text-[13px] text-surface-900 outline-none transition placeholder:text-surface-800/40 focus:border-brand-500';
const okCls = `${inputCls} border-surface-100`;
const errCls = `${inputCls} border-red-500 focus:border-red-500`;

/** 关系选项选择器（标题 + 候选下拉） */
function relationBlockCls(): string {
  return 'border-surface-100/80 bg-surface-50/40 rounded-lg border px-3 py-2.5';
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[55] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          class="border-surface-100/70 bg-surface-0/95 shadow-float flex max-h-[88vh] w-full max-w-lg flex-col rounded-xl border backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          :aria-label="item ? '编辑成果' : '新增成果'"
        >
          <!-- 头部 -->
          <header
            class="border-surface-100/70 flex items-center justify-between border-b px-5 py-4"
          >
            <h2 class="text-surface-900 text-sm font-semibold">
              {{ item ? '编辑成果' : '新增成果' }}
            </h2>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </header>

          <!-- 表单 -->
          <form class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" @submit.prevent="submit">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="ach-form-type"
                  >成果类型</label
                >
                <select id="ach-form-type" v-model="type" :class="okCls">
                  <option v-for="t in ACHIEVEMENT_TYPES" :key="t" :value="t">
                    {{ TYPE_META[t].label }}
                  </option>
                </select>
              </div>
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="ach-form-date"
                  >完成日期 *</label
                >
                <input
                  id="ach-form-date"
                  v-model="completedAt"
                  type="date"
                  :class="errors.completedAt ? errCls : okCls"
                  :aria-invalid="errors.completedAt ? 'true' : 'false'"
                  :aria-describedby="errors.completedAt ? 'ach-form-date-error' : undefined"
                  @input="clearError('completedAt')"
                />
                <p
                  v-if="errors.completedAt"
                  id="ach-form-date-error"
                  class="mt-1 text-[11px] text-red-600"
                >
                  {{ errors.completedAt }}
                </p>
              </div>
            </div>

            <div>
              <label class="text-surface-800/80 mb-1 block text-xs font-medium" for="ach-form-title"
                >标题 *</label
              >
              <input
                id="ach-form-title"
                v-model="title"
                type="text"
                maxlength="80"
                placeholder="例如：Personal OS v0.2 发布"
                :class="errors.title ? errCls : okCls"
                :aria-invalid="errors.title ? 'true' : 'false'"
                :aria-describedby="errors.title ? 'ach-form-title-error' : undefined"
                @input="clearError('title')"
              />
              <p
                v-if="errors.title"
                id="ach-form-title-error"
                class="mt-1 text-[11px] text-red-600"
              >
                {{ errors.title }}
              </p>
            </div>

            <div>
              <label
                class="text-surface-800/80 mb-1 block text-xs font-medium"
                for="ach-form-summary"
                >一句话摘要</label
              >
              <input
                id="ach-form-summary"
                v-model="summary"
                type="text"
                maxlength="120"
                placeholder="卡片与列表上展示的一句话说明"
                :class="okCls"
              />
            </div>

            <div>
              <label class="text-surface-800/80 mb-1 block text-xs font-medium" for="ach-form-desc"
                >详细描述</label
              >
              <textarea
                id="ach-form-desc"
                v-model="description"
                rows="4"
                placeholder="成果的完整描述、背景与收获…"
                :class="`${okCls} resize-none`"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="ach-form-tags"
                  >标签（逗号分隔）</label
                >
                <input
                  id="ach-form-tags"
                  v-model="tagsText"
                  type="text"
                  placeholder="vue, 自动化, 写作"
                  :class="errors.tags ? errCls : okCls"
                  :aria-invalid="errors.tags ? 'true' : 'false'"
                  :aria-describedby="errors.tags ? 'ach-form-tags-error' : undefined"
                  @input="clearError('tags')"
                />
                <p
                  v-if="errors.tags"
                  id="ach-form-tags-error"
                  class="mt-1 text-[11px] text-red-600"
                >
                  {{ errors.tags }}
                </p>
              </div>
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="ach-form-project"
                  >关联项目</label
                >
                <input
                  id="ach-form-project"
                  v-model="relatedProject"
                  type="text"
                  placeholder="自由文本（可选）"
                  :class="okCls"
                />
              </div>
            </div>

            <div>
              <label class="text-surface-800/80 mb-1 block text-xs font-medium" for="ach-form-link"
                >外部链接</label
              >
              <input
                id="ach-form-link"
                v-model="link"
                type="url"
                placeholder="https://…"
                :class="errors.link ? errCls : okCls"
                :aria-invalid="errors.link ? 'true' : 'false'"
                :aria-describedby="errors.link ? 'ach-form-link-error' : undefined"
                @input="clearError('link')"
              />
              <p v-if="errors.link" id="ach-form-link-error" class="mt-1 text-[11px] text-red-600">
                {{ errors.link }}
              </p>
            </div>

            <!-- 关键指标 -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <label class="text-surface-800/80 text-xs font-medium">关键指标</label>
                <button
                  type="button"
                  class="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-[11px] transition disabled:opacity-40"
                  :disabled="metrics.length >= 4"
                  @click="addMetric"
                >
                  <Plus class="size-3" />
                  添加指标
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="(m, i) in metrics" :key="i" class="flex items-center gap-2">
                  <input
                    v-model="m.label"
                    type="text"
                    placeholder="指标名（如：测试覆盖率）"
                    :class="okCls"
                  />
                  <input
                    v-model="m.value"
                    type="text"
                    placeholder="数值（如：96%）"
                    :class="okCls"
                  />
                  <button
                    type="button"
                    title="删除该指标"
                    aria-label="删除该指标"
                    class="text-surface-800/50 shrink-0 rounded-md p-1.5 transition hover:bg-red-500/10 hover:text-red-600"
                    @click="removeMetric(i)"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- 关系（仅存本地引用 ID，不修改其他模块 Store） -->
            <details class="border-surface-100/80 rounded-lg border">
              <summary
                class="text-surface-900 cursor-pointer px-3 py-2.5 text-xs font-semibold select-none"
              >
                关系（关联项目 / 工作流 / 前置 / 衍生）
              </summary>
              <div class="border-surface-100/80 space-y-3 border-t p-3">
                <!-- 关联项目 -->
                <div :class="relationBlockCls()">
                  <p class="text-surface-800/80 mb-1.5 text-[11px] font-medium">关联项目</p>
                  <div v-if="projectIds.length > 0" class="mb-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="pid in projectIds"
                      :key="pid"
                      class="bg-brand-500/10 text-brand-600 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                    >
                      {{ projectOptions.find((o) => o.id === pid)?.name ?? '（已失效）' }}
                      <button
                        type="button"
                        :aria-label="`移除项目 ${pid}`"
                        class="transition hover:text-red-600"
                        @click="projectIds = projectIds.filter((x) => x !== pid)"
                      >
                        <X class="size-3" />
                      </button>
                    </span>
                  </div>
                  <select
                    class="border-surface-100 bg-surface-0/70 text-surface-800/80 w-full rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="''"
                    aria-label="添加关联项目"
                    @change="
                      const id = ($event.target as HTMLSelectElement).value;
                      if (id) projectIds = toggleId(projectIds, id);
                      ($event.target as HTMLSelectElement).value = '';
                    "
                  >
                    <option value="">+ 选择项目</option>
                    <option
                      v-for="o in candidateOf(projectOptions, projectIds)"
                      :key="o.id"
                      :value="o.id"
                    >
                      {{ o.name }}
                    </option>
                  </select>
                </div>

                <!-- 关联工作流 -->
                <div :class="relationBlockCls()">
                  <p class="text-surface-800/80 mb-1.5 text-[11px] font-medium">关联工作流</p>
                  <div v-if="workflowIds.length > 0" class="mb-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="wid in workflowIds"
                      :key="wid"
                      class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600"
                    >
                      {{ workflowOptions.find((o) => o.id === wid)?.name ?? '（已失效）' }}
                      <button
                        type="button"
                        :aria-label="`移除工作流 ${wid}`"
                        class="transition hover:text-red-600"
                        @click="workflowIds = workflowIds.filter((x) => x !== wid)"
                      >
                        <X class="size-3" />
                      </button>
                    </span>
                  </div>
                  <select
                    class="border-surface-100 bg-surface-0/70 text-surface-800/80 w-full rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="''"
                    aria-label="添加关联工作流"
                    @change="
                      const id = ($event.target as HTMLSelectElement).value;
                      if (id) workflowIds = toggleId(workflowIds, id);
                      ($event.target as HTMLSelectElement).value = '';
                    "
                  >
                    <option value="">+ 选择工作流</option>
                    <option
                      v-for="o in candidateOf(workflowOptions, workflowIds)"
                      :key="o.id"
                      :value="o.id"
                    >
                      {{ o.name }}
                    </option>
                  </select>
                </div>

                <!-- 前置成果 -->
                <div :class="relationBlockCls()">
                  <p class="text-surface-800/80 mb-1.5 text-[11px] font-medium">
                    前置成果（本成果承接的成果）
                  </p>
                  <div v-if="predecessorIds.length > 0" class="mb-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="pid in predecessorIds"
                      :key="pid"
                      class="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600"
                    >
                      {{ allItems.find((a) => a.id === pid)?.title ?? '（已失效）' }}
                      <button
                        type="button"
                        :aria-label="`移除前置 ${pid}`"
                        class="transition hover:text-red-600"
                        @click="predecessorIds = predecessorIds.filter((x) => x !== pid)"
                      >
                        <X class="size-3" />
                      </button>
                    </span>
                  </div>
                  <select
                    class="border-surface-100 bg-surface-0/70 text-surface-800/80 w-full rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="''"
                    aria-label="添加前置成果"
                    @change="
                      const id = ($event.target as HTMLSelectElement).value;
                      if (id) predecessorIds = toggleId(predecessorIds, id);
                      ($event.target as HTMLSelectElement).value = '';
                    "
                  >
                    <option value="">+ 选择前置成果</option>
                    <option
                      v-for="a in allItems.filter((x) => x.id !== item?.id)"
                      :key="a.id"
                      :value="a.id"
                    >
                      {{ a.completedAt }} · {{ a.title }}
                    </option>
                  </select>
                </div>

                <!-- 衍生成果 -->
                <div :class="relationBlockCls()">
                  <p class="text-surface-800/80 mb-1.5 text-[11px] font-medium">
                    衍生成果（由本成果派生）
                  </p>
                  <div v-if="derivedIds.length > 0" class="mb-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="pid in derivedIds"
                      :key="pid"
                      class="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-600"
                    >
                      {{ allItems.find((a) => a.id === pid)?.title ?? '（已失效）' }}
                      <button
                        type="button"
                        :aria-label="`移除衍生 ${pid}`"
                        class="transition hover:text-red-600"
                        @click="derivedIds = derivedIds.filter((x) => x !== pid)"
                      >
                        <X class="size-3" />
                      </button>
                    </span>
                  </div>
                  <select
                    class="border-surface-100 bg-surface-0/70 text-surface-800/80 w-full rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="''"
                    aria-label="添加衍生成果"
                    @change="
                      const id = ($event.target as HTMLSelectElement).value;
                      if (id) derivedIds = toggleId(derivedIds, id);
                      ($event.target as HTMLSelectElement).value = '';
                    "
                  >
                    <option value="">+ 选择衍生成果</option>
                    <option
                      v-for="a in allItems.filter((x) => x.id !== item?.id)"
                      :key="a.id"
                      :value="a.id"
                    >
                      {{ a.completedAt }} · {{ a.title }}
                    </option>
                  </select>
                </div>
              </div>
            </details>

            <!-- 复用包 -->
            <details class="border-surface-100/80 rounded-lg border">
              <summary
                class="text-surface-900 cursor-pointer px-3 py-2.5 text-xs font-semibold select-none"
              >
                复用包（关键链接 / 使用说明 / 交付清单 / 复盘 / 模板片段）
              </summary>
              <div class="border-surface-100/80 space-y-3 border-t p-3">
                <div>
                  <div class="mb-1.5 flex items-center justify-between">
                    <p class="text-surface-800/80 text-[11px] font-medium">
                      关键链接（仅保存名称与 URL）
                    </p>
                    <button
                      type="button"
                      class="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-[11px] transition disabled:opacity-40"
                      :disabled="links.length >= 10"
                      @click="addLink"
                    >
                      <Plus class="size-3" />
                      添加链接
                    </button>
                  </div>
                  <div class="space-y-2">
                    <div v-for="(l, i) in links" :key="i" class="flex items-center gap-2">
                      <input
                        v-model="l.label"
                        type="text"
                        placeholder="名称（如：使用文档）"
                        :class="okCls"
                      />
                      <input v-model="l.url" type="url" placeholder="https://…" :class="okCls" />
                      <button
                        type="button"
                        title="删除该链接"
                        aria-label="删除该链接"
                        class="text-surface-800/50 shrink-0 rounded-md p-1.5 transition hover:bg-red-500/10 hover:text-red-600"
                        @click="removeLink(i)"
                      >
                        <Trash2 class="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p
                    v-if="errors.reuseLinks"
                    class="mt-1 flex items-center gap-1 text-[11px] text-red-600"
                    @click="clearError('reuseLinks')"
                  >
                    {{ errors.reuseLinks }}
                  </p>
                </div>

                <div>
                  <label
                    class="text-surface-800/80 mb-1 block text-[11px] font-medium"
                    for="ach-form-guide"
                  >
                    使用说明
                  </label>
                  <textarea
                    id="ach-form-guide"
                    v-model="usageGuide"
                    rows="3"
                    placeholder="别人怎么用这个成果？步骤、前提、注意事项…"
                    :class="`${okCls} resize-none`"
                  />
                </div>

                <div>
                  <label
                    class="text-surface-800/80 mb-1 block text-[11px] font-medium"
                    for="ach-form-checklist"
                  >
                    交付清单（每行一项）
                  </label>
                  <textarea
                    id="ach-form-checklist"
                    v-model="checklistText"
                    rows="3"
                    placeholder="例如：pnpm install 成功&#10;pnpm dev 可访问首页"
                    :class="`${okCls} resize-none`"
                  />
                </div>

                <div>
                  <label
                    class="text-surface-800/80 mb-1 block text-[11px] font-medium"
                    for="ach-form-retro"
                  >
                    复盘笔记
                  </label>
                  <textarea
                    id="ach-form-retro"
                    v-model="retrospective"
                    rows="3"
                    placeholder="过程中的经验、踩坑与改进…"
                    :class="`${okCls} resize-none`"
                  />
                </div>

                <div>
                  <label
                    class="text-surface-800/80 mb-1 block text-[11px] font-medium"
                    for="ach-form-snippet"
                  >
                    可复制模板片段
                  </label>
                  <textarea
                    id="ach-form-snippet"
                    v-model="templateSnippet"
                    rows="4"
                    placeholder="代码 / 文案 / 配置片段…"
                    :class="`${okCls} resize-none font-mono text-xs`"
                  />
                </div>
              </div>
            </details>
          </form>

          <!-- 底部 -->
          <footer
            class="border-surface-100/70 flex items-center justify-end gap-2 border-t px-5 py-3.5"
          >
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3 py-2 text-xs font-medium transition"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              class="bg-brand-500 hover:bg-brand-600 rounded-lg px-4 py-2 text-xs font-medium text-white shadow-sm transition"
              @click="submit"
            >
              {{ item ? '保存修改' : '创建成果' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
