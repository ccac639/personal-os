<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { aiApi, type ChatTurn, type VideoStatusResult } from '@/services/ai';

type TabId = 'chat' | 'image' | 'video' | 'tts';

const activeTab = ref<TabId>('chat');
const configured = ref(false);
const settingsLoaded = ref(false);
const busy = ref(false);
const errorMsg = ref('');
const infoMsg = ref('');

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'chat', label: '对话' },
  { id: 'image', label: '生图' },
  { id: 'video', label: '视频' },
  { id: 'tts', label: '语音' },
];

async function refreshSettings(): Promise<void> {
  try {
    const status = await aiApi.getSettings();
    configured.value = status.configured;
  } catch {
    configured.value = false;
  } finally {
    settingsLoaded.value = true;
  }
}

onMounted(() => {
  void refreshSettings();
});

function clearMsg(): void {
  errorMsg.value = '';
  infoMsg.value = '';
}

function showError(err: unknown): void {
  const e = err as { data?: { message?: string }; message?: string };
  errorMsg.value = e?.data?.message ?? e?.message ?? '请求失败，请稍后重试';
}

// ---------- 对话 ----------
const turns = ref<ChatTurn[]>([]);
const chatInput = ref('');
const chatModel = ref('Qwen/Qwen2.5-72B-Instruct');

async function sendChat(): Promise<void> {
  const content = chatInput.value.trim();
  if (!content || busy.value) return;
  clearMsg();
  turns.value.push({ role: 'user', content });
  chatInput.value = '';
  busy.value = true;
  try {
    const result = await aiApi.chat({ messages: turns.value, model: chatModel.value });
    turns.value.push({ role: 'assistant', content: result.content });
  } catch (err) {
    showError(err);
    turns.value.pop();
  } finally {
    busy.value = false;
  }
}

// ---------- 生图 ----------
const imagePrompt = ref('');
const imageModel = ref('Kwai-Kolors/Kolors');
const imageSize = ref('1024x1024');
const imageUrl = ref('');
const imageLoading = ref(false);

async function generateImage(): Promise<void> {
  const prompt = imagePrompt.value.trim();
  if (!prompt || imageLoading.value) return;
  clearMsg();
  imageLoading.value = true;
  imageUrl.value = '';
  try {
    const result = await aiApi.generateImage({
      prompt,
      model: imageModel.value,
      imageSize: imageSize.value,
    });
    imageUrl.value = result.url;
    infoMsg.value = '图片 URL 1 小时内有效，请尽快下载保存。';
  } catch (err) {
    showError(err);
  } finally {
    imageLoading.value = false;
  }
}

// ---------- 视频 ----------
const videoPrompt = ref('');
const videoModel = ref('Wan-AI/Wan2.2-T2V-A14B');
const videoSize = ref('1280x720');
const videoUrl = ref('');
const videoStatus = ref('');
const polling = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  polling.value = false;
}

async function submitVideo(): Promise<void> {
  const prompt = videoPrompt.value.trim();
  if (!prompt || polling.value) return;
  clearMsg();
  stopPolling();
  videoUrl.value = '';
  videoStatus.value = '提交中…';
  try {
    const result = await aiApi.submitVideo({
      prompt,
      model: videoModel.value,
      imageSize: videoSize.value,
    });
    videoStatus.value = 'InQueue';
    polling.value = true;
    void pollVideo(result.requestId);
  } catch (err) {
    showError(err);
    videoStatus.value = '';
  }
}

async function pollVideo(requestId: string): Promise<void> {
  try {
    const status: VideoStatusResult = await aiApi.getVideoStatus(requestId);
    videoStatus.value = status.status;
    if (status.status === 'Succeed' && status.url) {
      videoUrl.value = status.url;
      polling.value = false;
      infoMsg.value = '视频 URL 10 分钟内有效，请尽快下载保存。';
      return;
    }
    if (status.status === 'Failed') {
      polling.value = false;
      showError(new Error(status.reason ?? '视频生成失败'));
      return;
    }
    pollTimer = setTimeout(() => void pollVideo(requestId), 5_000);
  } catch (err) {
    polling.value = false;
    showError(err);
  }
}

// ---------- 语音 ----------
const ttsInput = ref('');
const ttsModel = ref('fnlp/MOSS-TTSD-v0.5');
const ttsVoice = ref('fnlp/MOSS-TTSD-v0.5:alex');
const ttsUrl = ref('');
const ttsLoading = ref(false);

async function generateTts(): Promise<void> {
  const input = ttsInput.value.trim();
  if (!input || ttsLoading.value) return;
  clearMsg();
  ttsLoading.value = true;
  ttsUrl.value = '';
  try {
    const blob = await aiApi.tts({ input, model: ttsModel.value, voice: ttsVoice.value });
    ttsUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    showError(err);
  } finally {
    ttsLoading.value = false;
  }
}

const notConfigured = computed(() => settingsLoaded.value && !configured.value);
</script>

<template>
  <div class="mx-auto flex h-full max-w-5xl flex-col gap-4 p-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-foreground text-xl font-semibold">AI 工作台</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          硅基流动（SiliconFlow）：对话 / 生图 / 视频 / 语音
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          :class="
            configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
          "
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="configured ? 'bg-emerald-500' : 'bg-amber-500'"
          />
          {{ configured ? 'SiliconFlow 已配置' : '未配置 API Key' }}
        </span>
        <RouterLink
          to="/settings"
          class="border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-medium transition"
        >
          设置
        </RouterLink>
      </div>
    </header>

    <!-- 未配置引导 -->
    <div
      v-if="notConfigured"
      class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700"
    >
      尚未配置 SiliconFlow API Key，AI 功能暂不可用。请先前往
      <RouterLink to="/settings" class="font-medium underline underline-offset-2"
        >设置页</RouterLink
      >
      输入 API Key（仅存于服务端 Redis，30 天有效，不会回显）。
    </div>

    <!-- Tab 栏 -->
    <nav class="border-border bg-card flex gap-1 rounded-xl border p-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition"
        :class="
          activeTab === tab.id
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 消息提示 -->
    <p
      v-if="errorMsg"
      class="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600"
    >
      {{ errorMsg }}
    </p>
    <p
      v-if="infoMsg"
      class="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm text-sky-600"
    >
      {{ infoMsg }}
    </p>

    <!-- 对话 -->
    <section v-if="activeTab === 'chat'" class="flex min-h-0 flex-1 flex-col gap-3">
      <div
        class="border-border bg-card flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border p-4"
      >
        <p v-if="turns.length === 0" class="text-muted-foreground m-auto text-sm">
          开始对话：输入消息后回车发送（默认 Qwen2.5-72B-Instruct）
        </p>
        <div
          v-for="(turn, i) in turns"
          :key="i"
          class="max-w-[85%] rounded-xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap"
          :class="
            turn.role === 'user'
              ? 'bg-primary text-primary-foreground self-end'
              : 'bg-muted text-foreground self-start'
          "
        >
          {{ turn.content }}
        </div>
      </div>
      <form class="flex gap-2" @submit.prevent="sendChat">
        <input
          v-model="chatInput"
          type="text"
          placeholder="输入消息…（回车发送）"
          class="border-border bg-card focus:border-primary flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none"
          :disabled="busy || !configured"
        />
        <button
          type="submit"
          class="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
          :disabled="busy || !configured || !chatInput.trim()"
        >
          {{ busy ? '思考中…' : '发送' }}
        </button>
      </form>
    </section>

    <!-- 生图 -->
    <section v-if="activeTab === 'image'" class="flex min-h-0 flex-1 flex-col gap-3">
      <form class="grid gap-3" @submit.prevent="generateImage">
        <textarea
          v-model="imagePrompt"
          rows="3"
          placeholder="描述你想生成的图片，例如：一只戴着宇航员头盔的橘猫，赛博朋克风格"
          class="border-border bg-card focus:border-primary resize-none rounded-xl border px-4 py-2.5 text-sm outline-none"
          :disabled="!configured"
        />
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <label class="text-muted-foreground flex items-center gap-2">
            模型
            <input
              v-model="imageModel"
              type="text"
              class="border-border bg-card rounded-lg border px-3 py-1.5 outline-none"
            />
          </label>
          <label class="text-muted-foreground flex items-center gap-2">
            尺寸
            <select
              v-model="imageSize"
              class="border-border bg-card rounded-lg border px-3 py-1.5 outline-none"
            >
              <option value="1024x1024">1024×1024</option>
              <option value="1280x720">1280×720</option>
              <option value="720x1280">720×1280</option>
            </select>
          </label>
          <button
            type="submit"
            class="bg-primary text-primary-foreground ml-auto rounded-xl px-5 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
            :disabled="imageLoading || !configured || !imagePrompt.trim()"
          >
            {{ imageLoading ? '生成中…' : '生成图片' }}
          </button>
        </div>
      </form>
      <div
        class="border-border bg-card flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border p-4"
      >
        <img
          v-if="imageUrl"
          :src="imageUrl"
          alt="生成结果"
          class="max-h-full max-w-full rounded-lg object-contain"
        />
        <p v-else class="text-muted-foreground text-sm">图片将显示在这里</p>
      </div>
    </section>

    <!-- 视频 -->
    <section v-if="activeTab === 'video'" class="flex min-h-0 flex-1 flex-col gap-3">
      <form class="grid gap-3" @submit.prevent="submitVideo">
        <textarea
          v-model="videoPrompt"
          rows="3"
          placeholder="描述视频画面，例如：日落时分的海边，海浪缓缓拍打沙滩，航拍视角"
          class="border-border bg-card focus:border-primary resize-none rounded-xl border px-4 py-2.5 text-sm outline-none"
          :disabled="!configured"
        />
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <label class="text-muted-foreground flex items-center gap-2">
            模型
            <input
              v-model="videoModel"
              type="text"
              class="border-border bg-card rounded-lg border px-3 py-1.5 outline-none"
            />
          </label>
          <label class="text-muted-foreground flex items-center gap-2">
            尺寸
            <select
              v-model="videoSize"
              class="border-border bg-card rounded-lg border px-3 py-1.5 outline-none"
            >
              <option value="1280x720">1280×720</option>
              <option value="1024x1024">1024×1024</option>
              <option value="720x1280">720×1280</option>
            </select>
          </label>
          <button
            type="submit"
            class="bg-primary text-primary-foreground ml-auto rounded-xl px-5 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
            :disabled="polling || !configured || !videoPrompt.trim()"
          >
            {{ polling ? '生成中…' : '生成视频' }}
          </button>
        </div>
      </form>
      <div
        class="border-border bg-card flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border p-4"
      >
        <video v-if="videoUrl" :src="videoUrl" controls class="max-h-full max-w-full rounded-lg" />
        <p v-else class="text-muted-foreground text-sm">
          {{ videoStatus ? `任务状态：${videoStatus}（每 5 秒自动刷新）` : '视频将显示在这里' }}
        </p>
      </div>
    </section>

    <!-- 语音 -->
    <section v-if="activeTab === 'tts'" class="flex min-h-0 flex-1 flex-col gap-3">
      <form class="grid gap-3" @submit.prevent="generateTts">
        <textarea
          v-model="ttsInput"
          rows="3"
          placeholder="输入要转为语音的文本，例如：你好，我是个人 AI 助手。"
          class="border-border bg-card focus:border-primary resize-none rounded-xl border px-4 py-2.5 text-sm outline-none"
          :disabled="!configured"
        />
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <label class="text-muted-foreground flex items-center gap-2">
            音色
            <input
              v-model="ttsVoice"
              type="text"
              class="border-border bg-card rounded-lg border px-3 py-1.5 outline-none"
            />
          </label>
          <button
            type="submit"
            class="bg-primary text-primary-foreground ml-auto rounded-xl px-5 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
            :disabled="ttsLoading || !configured || !ttsInput.trim()"
          >
            {{ ttsLoading ? '合成中…' : '合成语音' }}
          </button>
        </div>
      </form>
      <div
        class="border-border bg-card flex min-h-0 flex-1 items-center justify-center rounded-xl border p-4"
      >
        <audio v-if="ttsUrl" :src="ttsUrl" controls class="w-full max-w-md" />
        <p v-else class="text-muted-foreground text-sm">音频将显示在这里</p>
      </div>
    </section>
  </div>
</template>
