<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

const route = useRoute();
const slug = String(route.params.slug ?? '');
const { data } = await usePostDetail(slug);
const post = computed(() => data.value?.post ?? null);

// 服务端 API 已对未知 slug / draft（非 dev）返回 404；
// 客户端导航场景 useFetch 无数据时这里兜底抛 404。
if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: '文章不存在', fatal: true });
}

// ---------- 阅读进度条（SSR 安全：仅客户端访问 window/document） ----------
const scrollY = ref(0);
const progress = computed(() => {
  if (import.meta.server) return 0;
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(100, (scrollY.value / max) * 100) : 0;
});
function onScroll() {
  if (import.meta.server) return;
  scrollY.value = window.scrollY;
}

// ---------- TOC（基于正文 headings，与渲染器 id 同规则） ----------
const headings = computed(() => post.value?.headings ?? []);
const activeHeadingId = ref('');
function onTocClick(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const observer = ref<IntersectionObserver | null>(null);
function setupObserver() {
  observer.value?.disconnect();
  observer.value = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top);
      if (visible[0]) {
        activeHeadingId.value = String(visible[0].target.id);
      }
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  );
  headings.value.forEach((h) => {
    const el = document.getElementById(h.id);
    if (el) observer.value?.observe(el);
  });
}

// ---------- 相关文章（同首个标签，排除当前，最多 3 篇） ----------
const firstTag = computed(() => post.value?.tags[0]);
const { data: relatedData } = await usePostsByTag(firstTag.value ?? '');
const related = computed(() =>
  (relatedData.value ?? []).filter((p) => p.slug !== slug).slice(0, 3),
);

onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  setupObserver();
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  observer.value?.disconnect();
});

useSeoMeta({
  title: post.value.title,
  titleTemplate: '%s · Personal OS Blog',
  description: post.value.description,
  ogType: 'article',
  ogTitle: post.value.title,
  ogDescription: post.value.description,
  articlePublishedTime: post.value.date,
  articleModifiedTime: post.value.updated,
  articleTag: post.value.tags,
});

// BlogPosting 结构化数据由 <SchemaOrgArticle /> 组件注册（vue 集成中
// defineArticle 仅构造带 resolver 的对象，不注册节点，已核实 vue.mjs）
</script>

<template>
  <div class="relative">
    <!-- 阅读进度条 -->
    <div
      class="bg-brand-500 fixed top-0 left-0 z-20 h-0.5 transition-[width] duration-100"
      :style="{ width: `${progress}%` }"
      aria-hidden="true"
    />

    <article v-if="post" class="mx-auto max-w-3xl">
      <header class="mb-8">
        <div class="text-surface-800/50 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <time :datetime="post.date">{{ post.date }}</time>
          <template v-if="post.updated">
            <span class="text-surface-800/30">·</span>
            <span>更新于 {{ post.updated }}</span>
          </template>
          <span class="text-surface-800/30">·</span>
          <span>{{ post.readingMinutes }} 分钟阅读</span>
          <span class="text-surface-800/30">·</span>
          <NuxtLink
            :to="`/categories/${encodeURIComponent(post.category)}`"
            class="text-brand-600 hover:underline"
          >
            {{ post.category }}
          </NuxtLink>
        </div>
        <h1 class="mt-2 text-3xl leading-tight font-bold">{{ post.title }}</h1>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <NuxtLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/tags/${encodeURIComponent(tag)}`"
            class="bg-surface-100 text-surface-800/70 hover:text-brand-600 rounded-full px-2.5 py-0.5 text-xs"
          >
            #{{ tag }}
          </NuxtLink>
        </div>
      </header>

      <div class="lg:flex lg:gap-10">
        <!-- TOC 侧栏（桌面端 ≥1024px；移动端隐藏） -->
        <aside v-if="headings.length > 0" class="hidden lg:block lg:w-56 lg:shrink-0">
          <nav class="border-surface-100 sticky top-20 max-h-[70vh] overflow-y-auto border-l pl-4">
            <p class="text-surface-800/50 mb-2 text-xs font-medium">目录</p>
            <ul class="space-y-1 text-sm">
              <li v-for="h in headings" :key="h.id">
                <a
                  :href="`#${h.id}`"
                  class="block truncate py-0.5 transition-colors"
                  :class="[
                    h.level === 3 ? 'pl-3' : '',
                    h.level === 4 ? 'pl-6' : '',
                    activeHeadingId === h.id
                      ? 'text-brand-600 font-medium'
                      : 'text-surface-800/60 hover:text-surface-900',
                  ]"
                  @click.prevent="onTocClick(h.id)"
                >
                  {{ h.text }}
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        <!-- 正文为服务端 markdown 渲染器产出：所有文本已转义，无原始 HTML 注入 -->
        <div class="prose-blog min-w-0 flex-1" v-html="post.body" />
      </div>

      <!-- BlogPosting 结构化数据：headline/datePublished/author 是搜索引擎最低要求 -->
      <SchemaOrgArticle
        type="BlogPosting"
        :headline="post.title"
        :description="post.description"
        :date-published="post.date"
        :date-modified="post.updated"
        :author="{ name: 'Personal OS' }"
        :keywords="post.tags"
        in-language="zh-CN"
      />

      <nav
        v-if="data?.prev || data?.next"
        class="border-surface-100 mt-10 grid gap-3 border-t pt-6 text-sm sm:grid-cols-2"
      >
        <NuxtLink
          v-if="data?.next"
          :to="`/posts/${data.next.slug}`"
          class="rounded-card border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/50 border p-4 transition-colors"
        >
          <span class="text-surface-800/50 block text-xs">下一篇</span>
          <span class="hover:text-brand-600 mt-1 block font-medium">{{ data.next.title }}</span>
        </NuxtLink>
        <NuxtLink
          v-if="data?.prev"
          :to="`/posts/${data.prev.slug}`"
          class="rounded-card border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/50 border p-4 text-right transition-colors sm:col-start-2"
        >
          <span class="text-surface-800/50 block text-xs">上一篇</span>
          <span class="hover:text-brand-600 mt-1 block font-medium">{{ data.prev.title }}</span>
        </NuxtLink>
      </nav>

      <!-- 相关文章（同标签，最多 3 篇） -->
      <section v-if="related.length > 0" class="border-surface-100 mt-10 border-t pt-6">
        <h2 class="text-surface-900 mb-3 text-lg font-semibold">相关文章</h2>
        <ul class="grid gap-2 sm:grid-cols-3">
          <li v-for="p in related" :key="p.slug">
            <NuxtLink
              :to="`/posts/${p.slug}`"
              class="rounded-card border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/50 block h-full border p-3 transition-colors"
            >
              <span class="text-surface-800/50 block text-xs">{{ p.date }}</span>
              <span class="hover:text-brand-600 mt-1 line-clamp-2 block text-sm font-medium">
                {{ p.title }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </article>
  </div>
</template>
