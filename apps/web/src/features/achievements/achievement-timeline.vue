<script setup lang="ts">
import { computed, ref } from 'vue';
import { Archive, ChevronDown, ChevronUp, Inbox, Pencil, Pin, Trash2 } from '@lucide/vue';
import { TYPE_META, tagCls } from './constants';
import { hasReuse } from './reuse';
import type { Achievement } from './types';

const props = defineProps<{
  items: Achievement[];
  selectedIds: string[];
  manual: boolean;
}>();

const emit = defineEmits<{
  open: [item: Achievement];
  select: [id: string];
  move: [id: string, dir: -1 | 1];
  pin: [id: string];
  edit: [item: Achievement];
  archive: [id: string];
  remove: [id: string];
}>();

/** 按年份分组（降序），组内按完成日期降序 */
const groups = computed(() => {
  const map = new Map<number, Achievement[]>();
  for (const item of props.items) {
    const y = Number(item.completedAt.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    const list = map.get(y) ?? [];
    list.push(item);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({
      year,
      items: [...list].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    }));
});

/** 年份定位 */
function jumpToYear(year: number) {
  document
    .getElementById(`ach-year-${year}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 两段式删除确认 */
const confirmingId = ref<string | null>(null);
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

function askRemove(id: string) {
  if (confirmingId.value === id) {
    emit('remove', id);
    resetConfirm();
    return;
  }
  confirmingId.value = id;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(resetConfirm, 2500);
}

function resetConfirm() {
  confirmingId.value = null;
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 年份定位 -->
    <div v-if="groups.length > 0" class="flex items-center gap-2">
      <label for="ach-year-jump" class="text-surface-800/60 text-xs">定位到年份</label>
      <select
        id="ach-year-jump"
        class="border-surface-100 bg-surface-0/70 text-surface-800/80 hover:border-surface-800/30 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        :value="groups[0]?.year ?? ''"
        aria-label="定位到年份"
        @change="jumpToYear(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="g in groups" :key="g.year" :value="g.year">
          {{ g.year }} 年（{{ g.items.length }}）
        </option>
      </select>
    </div>

    <section
      v-for="group in groups"
      :id="`ach-year-${group.year}`"
      :key="group.year"
      class="scroll-mt-4"
    >
      <!-- 年份标题 -->
      <div class="mb-4 flex items-center gap-3">
        <h3 class="text-surface-900 text-base font-semibold tabular-nums">{{ group.year }}</h3>
        <span class="text-surface-800/50 text-xs">{{ group.items.length }} 项成果</span>
        <div class="bg-surface-100/70 h-px min-w-0 flex-1" />
      </div>

      <!-- 时间线 -->
      <ol
        class="relative ml-2 space-y-4 border-l border-dashed pl-4 sm:pl-5"
        :style="{ borderColor: 'var(--color-surface-100)' }"
      >
        <li v-for="item in group.items" :key="item.id" class="group relative">
          <!-- 圆点 -->
          <span
            class="absolute top-4 -left-[25px] size-2.5 rounded-full ring-4 ring-white/70"
            :class="TYPE_META[item.type].dot"
          />

          <!-- 条目卡片 -->
          <div
            class="border-surface-100/70 bg-surface-0/70 shadow-card hover:shadow-float cursor-pointer rounded-xl border p-3.5 backdrop-blur-xl transition-all duration-200 hover:-translate-y-px sm:p-4"
            :class="
              selectedIds.includes(item.id) ? 'border-brand-500/50 ring-brand-500/20 ring-2' : ''
            "
            @click="emit('open', item)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    :class="TYPE_META[item.type].chip"
                  >
                    <component :is="TYPE_META[item.type].icon" class="size-3" />
                    {{ TYPE_META[item.type].label }}
                  </span>
                  <span class="text-surface-800/50 text-[10px] tabular-nums">{{
                    item.completedAt
                  }}</span>
                  <Pin
                    v-if="item.pinned"
                    class="size-3 fill-amber-500 text-amber-500"
                    aria-label="已置顶"
                  />
                  <span
                    v-if="hasReuse(item)"
                    class="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] text-emerald-600/80"
                  >
                    复用包
                  </span>
                </div>
                <h4
                  class="text-surface-900 mt-1.5 line-clamp-2 text-sm leading-snug font-semibold break-words"
                >
                  {{ item.title }}
                </h4>
                <p
                  class="text-surface-800/60 mt-1 line-clamp-2 text-xs leading-relaxed break-words"
                >
                  {{ item.summary || '暂无摘要' }}
                </p>
                <div v-if="item.tags.length" class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="t in item.tags.slice(0, 4)"
                    :key="t"
                    class="max-w-full truncate rounded-full px-2 py-0.5 text-[10px]"
                    :class="tagCls(t)"
                  >
                    {{ t }}
                  </span>
                </div>
              </div>

              <!-- 多选 + 操作 -->
              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  role="checkbox"
                  :aria-checked="selectedIds.includes(item.id)"
                  :aria-label="
                    selectedIds.includes(item.id) ? `取消选择 ${item.title}` : `选择 ${item.title}`
                  "
                  class="text-surface-800/40 hover:text-brand-600 rounded p-0.5 transition"
                  @click.stop="emit('select', item.id)"
                >
                  <svg
                    viewBox="0 0 16 16"
                    class="size-4"
                    :class="
                      selectedIds.includes(item.id) ? 'text-brand-600 fill-brand-600' : 'fill-none'
                    "
                    aria-hidden="true"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="14"
                      height="14"
                      rx="3"
                      :class="
                        selectedIds.includes(item.id) ? 'stroke-brand-600' : 'stroke-surface-800/40'
                      "
                      stroke-width="1.5"
                    />
                    <path
                      v-if="selectedIds.includes(item.id)"
                      d="M4.5 8.2 7 10.6l4.5-5"
                      class="stroke-white"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      fill="none"
                    />
                  </svg>
                </button>
                <div
                  class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <button
                    v-if="manual"
                    type="button"
                    title="上移"
                    aria-label="上移"
                    class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
                    @click.stop="emit('move', item.id, -1)"
                  >
                    <ChevronUp class="size-3.5" />
                  </button>
                  <button
                    v-if="manual"
                    type="button"
                    title="下移"
                    aria-label="下移"
                    class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
                    @click.stop="emit('move', item.id, 1)"
                  >
                    <ChevronDown class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    :title="item.pinned ? '取消置顶' : '置顶'"
                    :aria-label="item.pinned ? '取消置顶' : '置顶'"
                    class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
                    @click.stop="emit('pin', item.id)"
                  >
                    <Pin class="size-3.5" :class="item.pinned ? 'fill-current' : ''" />
                  </button>
                  <button
                    type="button"
                    title="编辑"
                    aria-label="编辑"
                    class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
                    @click.stop="emit('edit', item)"
                  >
                    <Pencil class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    :title="item.archived ? '取消归档' : '归档'"
                    :aria-label="item.archived ? '取消归档' : '归档'"
                    class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
                    @click.stop="emit('archive', item.id)"
                  >
                    <component :is="item.archived ? Inbox : Archive" class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    :title="confirmingId === item.id ? '再次点击确认删除' : '删除'"
                    :aria-label="confirmingId === item.id ? '再次点击确认删除' : '删除'"
                    class="text-surface-800/50 rounded-md p-1.5 transition"
                    :class="
                      confirmingId === item.id
                        ? 'bg-red-500/10 text-red-600'
                        : 'hover:bg-red-500/10 hover:text-red-600'
                    "
                    @click.stop="askRemove(item.id)"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <p
      v-if="groups.length === 0"
      class="border-surface-100/70 bg-surface-0/70 text-surface-800/50 rounded-xl border border-dashed py-10 text-center text-sm"
    >
      暂无符合条件的成果
    </p>
  </div>
</template>
