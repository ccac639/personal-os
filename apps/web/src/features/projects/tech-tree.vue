<script setup lang="ts">
import TechIcon from './tech-icon.vue';
import { techTree } from './tech-stack';
</script>

<template>
  <div class="space-y-4">
    <section
      v-for="group in techTree"
      :key="group.id"
      class="rounded-card bg-surface-0 shadow-card overflow-hidden border border-neutral-200"
    >
      <!-- 分组标题 -->
      <header class="flex items-center gap-2.5 border-b border-neutral-100 px-5 py-3.5">
        <component :is="group.icon" class="text-brand-600 size-4.5" />
        <h2 class="text-sm font-semibold text-neutral-900">{{ group.label }}</h2>
        <span class="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
          {{
            group.subGroups
              ? group.subGroups.reduce((n, s) => n + s.items.length, 0)
              : (group.items?.length ?? 0)
          }}
        </span>
      </header>

      <div class="px-5 py-4">
        <!-- 前端组：子类 → 技术（树形第二层） -->
        <template v-if="group.subGroups">
          <div v-for="sub in group.subGroups" :key="sub.label" class="mb-4 last:mb-0">
            <h3 class="mb-2.5 text-xs font-medium text-neutral-400">{{ sub.label }}</h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in sub.items"
                :key="item.name"
                class="bg-surface-50 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700"
                :title="item.name"
              >
                <TechIcon :item="item" :size="18" />
                {{ item.name }}
              </span>
            </div>
          </div>
        </template>

        <!-- 其他组：技术平铺 -->
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="item in group.items ?? []"
            :key="item.name"
            class="bg-surface-50 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700"
            :title="item.name"
          >
            <TechIcon :item="item" :size="18" />
            {{ item.name }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>
