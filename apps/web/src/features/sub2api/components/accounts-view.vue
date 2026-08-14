<script setup lang="ts">
/** 账号视图：订阅账号 CRUD + 连接测试（防重复提交）+ 订阅只读列表（可撤销） */
import { computed, reactive, ref } from 'vue';
import { PlugZap, Pencil, Plus, Power, Trash2, XCircle } from '@lucide/vue';

import { confirm } from '@/app/confirm';
import type { AccountInput, Sub2ApiAccount, Sub2ApiListQuery } from '@/services/sub2api';
import {
  useSub2ApiAccounts,
  useSub2ApiAllGroups,
  useSub2ApiCreateAccount,
  useSub2ApiDeleteAccount,
  useSub2ApiRevokeSubscription,
  useSub2ApiSubscriptions,
  useSub2ApiTestAccount,
  useSub2ApiToggleAccount,
  useSub2ApiUpdateAccount,
} from '../hooks';
import { formatDateTime, nextAccountStatus, platformLabel } from '../format';
import AccountFormDialog from './account-form-dialog.vue';
import ErrorBanner from './error-banner.vue';
import PaginationBar from './pagination-bar.vue';
import StatusBadge from './status-badge.vue';

const PAGE_SIZE = 10;

const query = reactive<Sub2ApiListQuery>({ page: 1, pageSize: PAGE_SIZE });

const { data, isLoading, isError, error, refetch } = useSub2ApiAccounts(query);
const { data: allGroups } = useSub2ApiAllGroups();
const { data: subscriptions } = useSub2ApiSubscriptions({ page: 1, pageSize: 20 });

const createAccount = useSub2ApiCreateAccount();
const updateAccount = useSub2ApiUpdateAccount();
const toggleAccount = useSub2ApiToggleAccount();
const deleteAccount = useSub2ApiDeleteAccount();
const testAccount = useSub2ApiTestAccount();
const revokeSubscription = useSub2ApiRevokeSubscription();

const formVisible = ref(false);
const editing = ref<Sub2ApiAccount | null>(null);

/** 连接测试进行中的账号 id（防重复提交） */
const testingId = ref<number | null>(null);
const testMessage = ref<{ id: number; text: string; ok: boolean } | null>(null);

function goPage(page: number): void {
  query.page = page;
}

function startCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function startEdit(account: Sub2ApiAccount): void {
  editing.value = account;
  formVisible.value = true;
}

async function submitForm(input: AccountInput): Promise<void> {
  if (editing.value) {
    await updateAccount.mutateAsync({ id: editing.value.id, input });
  } else {
    await createAccount.mutateAsync(input);
  }
  formVisible.value = false;
}

async function onToggle(account: Sub2ApiAccount): Promise<void> {
  const next = nextAccountStatus(account);
  await toggleAccount.mutateAsync({ id: account.id, status: next });
}

async function onDelete(account: Sub2ApiAccount): Promise<void> {
  const ok = await confirm({
    title: '删除账号',
    message: `确定删除账号「${account.name}」？关联的上游订阅凭据将一并移除。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  await deleteAccount.mutateAsync(account.id);
}

async function onTest(account: Sub2ApiAccount): Promise<void> {
  if (testingId.value !== null) return; // 防重复提交
  testMessage.value = null;
  testingId.value = account.id;
  try {
    const result = await testAccount.mutateAsync(account.id);
    testMessage.value = {
      id: account.id,
      text: result.message || (result.success ? '连接成功' : '连接失败'),
      ok: result.success,
    };
  } catch (err) {
    testMessage.value = {
      id: account.id,
      text: err instanceof Error ? err.message : '连接测试失败',
      ok: false,
    };
  } finally {
    testingId.value = null;
  }
}

async function onRevoke(subId: number, name: string): Promise<void> {
  const ok = await confirm({
    title: '撤销订阅',
    message: `确定撤销订阅（${name}）？撤销后该订阅立即失效。`,
    confirmText: '撤销',
    tone: 'danger',
  });
  if (!ok) return;
  await revokeSubscription.mutateAsync(subId);
}

const rows = computed<Sub2ApiAccount[]>(() => data.value?.items ?? []);
const subRows = computed(() => subscriptions.value?.items ?? []);
const pendingBusy = computed(
  () =>
    createAccount.isPending.value || updateAccount.isPending.value || deleteAccount.isPending.value,
);
</script>

<template>
  <div class="space-y-2.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === undefined
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="
            query.status = undefined;
            query.page = 1;
          "
        >
          全部
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === 'active'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="
            query.status = 'active';
            query.page = 1;
          "
        >
          正常
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === 'inactive'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="
            query.status = 'inactive';
            query.page = 1;
          "
        >
          停用
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === 'error'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="
            query.status = 'error';
            query.page = 1;
          "
        >
          异常
        </button>
      </div>
      <button
        type="button"
        class="bg-brand-500 hover:bg-brand-600 flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-medium text-white"
        :disabled="pendingBusy"
        @click="startCreate"
      >
        <Plus class="size-3.5" aria-hidden="true" />
        新建账号
      </button>
    </div>

    <ErrorBanner v-if="isError" :error="error" @retry="refetch()" />

    <div v-if="isLoading" class="text-surface-800/50 py-10 text-center text-xs" role="status">
      加载账号…
    </div>

    <div
      v-else-if="rows.length === 0"
      class="text-surface-800/50 border-surface-100 rounded border border-dashed py-10 text-center text-xs"
    >
      暂无账号{{ query.status ? '（当前筛选条件下）' : '' }}
    </div>

    <section v-else class="border-surface-100 bg-surface-0/60 overflow-hidden rounded border">
      <table class="w-full text-left text-[11px]">
        <thead>
          <tr class="text-surface-800/50 border-surface-100 border-b">
            <th class="px-3 py-1.5 font-medium">名称</th>
            <th class="px-3 py-1.5 font-medium">平台 / 类型</th>
            <th class="px-3 py-1.5 font-medium">状态</th>
            <th class="px-3 py-1.5 text-right font-medium">优先级</th>
            <th class="px-3 py-1.5 text-right font-medium">并发</th>
            <th class="px-3 py-1.5 font-medium">最近使用</th>
            <th class="px-3 py-1.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="text-surface-900">
          <tr
            v-for="account in rows"
            :key="account.id"
            class="border-surface-100/60 border-b last:border-0"
          >
            <td class="px-3 py-1.5">
              <p class="font-medium">{{ account.name }}</p>
              <p
                v-if="account.error_message"
                class="max-w-[16rem] truncate text-[10px] text-red-600/80"
              >
                {{ account.error_message }}
              </p>
            </td>
            <td class="px-3 py-1.5">
              <span class="text-surface-900">{{ platformLabel(account.platform) }}</span>
              <span class="text-surface-800/40 ml-1 font-mono text-[10px]">{{ account.type }}</span>
            </td>
            <td class="px-3 py-1.5"><StatusBadge :status="account.status" /></td>
            <td class="px-3 py-1.5 text-right tabular-nums">{{ account.priority }}</td>
            <td class="px-3 py-1.5 text-right tabular-nums">{{ account.concurrency }}</td>
            <td class="px-3 py-1.5 whitespace-nowrap tabular-nums">
              {{ formatDateTime(account.last_used_at) }}
            </td>
            <td class="px-3 py-1.5">
              <div class="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                  :title="account.status === 'active' ? '停用' : '启用'"
                  aria-label="切换账号状态"
                  :disabled="toggleAccount.isPending.value"
                  @click="onToggle(account)"
                >
                  <Power class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded px-1.5 py-1 text-[10px]"
                  title="连接测试"
                  aria-label="账号连接测试"
                  :disabled="testingId !== null"
                  @click="onTest(account)"
                >
                  <PlugZap class="size-3.5" aria-hidden="true" />
                  {{ testingId === account.id ? '测试中…' : '测试' }}
                </button>
                <button
                  type="button"
                  class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                  title="编辑"
                  aria-label="编辑账号"
                  @click="startEdit(account)"
                >
                  <Pencil class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-red-600/70 hover:bg-red-500/10"
                  title="删除"
                  aria-label="删除账号"
                  :disabled="deleteAccount.isPending.value"
                  @click="onDelete(account)"
                >
                  <Trash2 class="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <PaginationBar
        :page="query.page ?? 1"
        :page-size="PAGE_SIZE"
        :total="data?.total ?? 0"
        :pages="data?.pages ?? 1"
        :loading="isLoading"
        @change="goPage"
      />
    </section>

    <!-- 连接测试结果 -->
    <p
      v-if="testMessage"
      class="px-1 text-[11px]"
      :class="testMessage.ok ? 'text-emerald-700' : 'text-red-600'"
      role="status"
    >
      {{ testMessage.text }}
    </p>

    <!-- 订阅列表（只读 + 撤销） -->
    <section class="border-surface-100 bg-surface-0/60 rounded border">
      <div class="border-surface-100 border-b px-3 py-2">
        <h3 class="text-surface-900 text-xs font-medium">订阅（只读，最多展示 20 条）</h3>
      </div>
      <div
        v-if="subRows.length === 0"
        class="text-surface-800/50 px-3 py-5 text-center text-[11px]"
      >
        暂无订阅记录
      </div>
      <table v-else class="w-full text-left text-[11px]">
        <thead>
          <tr class="text-surface-800/50 border-surface-100 border-b">
            <th class="px-3 py-1.5 font-medium">ID</th>
            <th class="px-3 py-1.5 font-medium">分组</th>
            <th class="px-3 py-1.5 font-medium">状态</th>
            <th class="px-3 py-1.5 text-right font-medium">今日用量</th>
            <th class="px-3 py-1.5 text-right font-medium">本月用量</th>
            <th class="px-3 py-1.5 font-medium">到期时间</th>
            <th class="px-3 py-1.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="text-surface-900">
          <tr
            v-for="sub in subRows"
            :key="sub.id"
            class="border-surface-100/60 border-b last:border-0"
          >
            <td class="px-3 py-1.5 font-mono text-[10px]">#{{ sub.id }}</td>
            <td class="px-3 py-1.5">{{ sub.group?.name ?? '—' }}</td>
            <td class="px-3 py-1.5"><StatusBadge :status="sub.status" /></td>
            <td class="px-3 py-1.5 text-right tabular-nums">
              ${{ sub.daily_usage_usd.toFixed(4) }}
            </td>
            <td class="px-3 py-1.5 text-right tabular-nums">
              ${{ sub.monthly_usage_usd.toFixed(4) }}
            </td>
            <td class="px-3 py-1.5 whitespace-nowrap tabular-nums">
              {{ formatDateTime(sub.expires_at) }}
            </td>
            <td class="px-3 py-1.5">
              <div class="flex justify-end">
                <button
                  v-if="sub.status === 'active'"
                  type="button"
                  class="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-red-600/70 hover:bg-red-500/10"
                  :disabled="revokeSubscription.isPending.value"
                  @click="onRevoke(sub.id, sub.group?.name ?? String(sub.id))"
                >
                  <XCircle class="size-3" aria-hidden="true" />
                  撤销
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AccountFormDialog
      :visible="formVisible"
      :item="editing"
      :groups="allGroups ?? []"
      :busy="pendingBusy"
      @close="formVisible = false"
      @submit="submitForm"
    />
  </div>
</template>
