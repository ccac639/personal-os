<script setup lang="ts">
/**
 * 按钮原语：统一主/次/危险/幽灵变体与尺寸，消除 feature 级重复按钮 class。
 * 使用：<AppButton variant="primary" size="sm" @click="...">内容</AppButton>
 * 附加 class 自动透传合并到根 button（如 flex-1 / w-full）。
 */
defineOptions({ name: 'AppButton', inheritAttrs: true });

withDefaults(
  defineProps<{
    /** primary=品牌主按钮（默认）；secondary=描边次按钮；danger=危险；ghost=无底幽灵 */
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    /** md=常规（默认）；sm=紧凑；lg=大；icon=方形图标按钮 */
    size?: 'sm' | 'md' | 'lg' | 'icon';
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** 加载中：禁用 + 等待光标（不阻塞 slot 内容） */
    loading?: boolean;
    title?: string;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false },
);

const variantClasses: Record<string, string> = {
  primary: 'bg-brand-600 text-surface-0 shadow-sm hover:bg-brand-700',
  secondary:
    'border-surface-100 bg-surface-0 text-surface-800/70 shadow-sm hover:bg-surface-50 hover:text-surface-900 border',
  danger: 'bg-danger-600 text-surface-0 shadow-sm hover:bg-danger-700',
  ghost: 'text-surface-800/70 hover:bg-surface-100 hover:text-surface-900',
};

const sizeClasses: Record<string, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-1.5 px-3.5 py-2 text-sm',
  lg: 'gap-2 px-4 py-2.5 text-base',
  icon: 'size-8 gap-0 p-0',
};
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :title="title"
    class="focus-visible:ring-brand-400 inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    :class="[variantClasses[variant], sizeClasses[size], loading ? 'cursor-wait' : '']"
  >
    <slot />
  </button>
</template>
