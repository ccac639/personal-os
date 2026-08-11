<template>
  <div class="bg-surface-50 text-surface-900 min-h-screen">
    <header class="border-surface-100 bg-surface-0 border-b">
      <div class="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 font-semibold">
        <span class="bg-brand-500 inline-block size-2 rounded-full" />
        Personal OS Blog
      </div>
    </header>
    <main class="mx-auto max-w-4xl px-4 py-8">
      <slot />
    </main>
    <footer class="text-surface-800/50 mx-auto max-w-4xl px-4 py-6 text-center text-xs">
      © {{ new Date().getFullYear() }} Personal OS
    </footer>
  </div>
</template>
