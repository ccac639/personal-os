# ADR-0003: Web 端统一路由页面过渡系统

- 状态：已接受（2026-08-13）
- 决策者：个人 AI 软件工程团队（Orchestrator + Developer + Reviewer 角色）

## 背景

Web 端此前使用 `motion-v` 的 `AnimatePresence` 做简单淡入淡出（250ms，
opacity + y），切换质感平淡，且页面结构（App.vue 传 slot、布局内包一层
motion.div）使页面根节点与过渡系统耦合。需求：一套「炫技感」但克制的统一
路由过渡——旧页淡出缩小 → 中心扫描线/光带 → 新页从中心展开 → 内容分层进入，
同时保证快速连续切换只保留最后一次导航、不遮挡弹窗/toast、支持
`prefers-reduced-motion`。

## 决策

### 1. 过渡机制：Vue `<Transition>`（替换 motion-v AnimatePresence 页面部分）

按需求方指定模板，使用 Vue Router 官方模式：

```html
<RouterView v-slot="{ Component, route: viewRoute }">
  <Transition :name="getRouteTransition(viewRoute)" mode="out-in" appear ...>
    <KeepAlive :include="keepAlivePages">
      <component :is="Component" :key="viewRoute.fullPath" />
    </KeepAlive>
  </Transition>
</RouterView>
```

- `mode="out-in"` 保证旧页完全离场后才入场新页，无重叠、无残影；
- 路由视图从 App.vue 下沉到 `default-layout.vue` 的 `<main>` 内，
  顶部导航等持久 UI 不参与页面动画；
- motion-v 仅保留用于导航下划线（layoutId FLIP）、hover/涟漪等交互微动效，
  与页面过渡系统职责分离，不重复创建第二套路由动画。

### 2. 过渡遮罩：模块级单例状态 + 定时器安全管理

新建 `src/composables/use-page-transition.ts`：

- 状态放模块作用域（非组件内），`router.onError` 等非组件代码也能清理；
- `showTransitionOverlay` 幂等，且先清除旧 hide/safety 定时器——快速连续
  导航时旧动画被取消，只保留最后一次导航的遮罩生命周期；
- `SAFETY_MS=1500` 兜底：路由失败、动画取消且未恢复等异常路径下遮罩
  强制销毁，绝不长期遮挡；
- 遮罩 `position: fixed + pointer-events: none + z-index: 9000`（CSS 变量
  可覆盖）。9s 设计说明：遮罩仅在路由切换期间存在（约 0.9s）、底色 8% 透明度、
  不拦截任何事件，因此不会对弹窗/toast 造成可感知遮挡或交互阻断；若未来
  需要严格压到全局弹窗之下，覆盖 `--page-transition-z` 即可。

### 3. 动画实现：纯 CSS transform/opacity/filter

- 时长：旧页退场 360ms → 扫描线 520ms（与新页入场并行）→ 新页入场 360ms →
  遮罩在入场完成 200ms 后销毁（扫描线完整收尾）；
- 旧页退场期间 `position: absolute`，避免不同高度页面引起滚动条/布局跳动；
- 扫描线/网格/噪点全部走 transform/opacity，不触发布局计算；噪点为静态
  SVG feTurbulence 贴图（opacity 0.035），不做逐帧动画；
- `prefers-reduced-motion: reduce` 下全部动画关闭、遮罩隐藏。

### 4. 内容分层进入：语义类 `page-content-section`

仅对首页 / Chat / 工作流 / 项目四页的主要区块显式添加该类，60/110/160ms
依次上移淡入；长列表（项目卡片网格）整体进入，不给列表项逐个加动画。
其余页面不加类 = 跟随统一页面过渡，不做额外分层，保持克制。

### 5. 单根节点约束

Vue `<Transition>` 要求被包裹组件为单根节点：排查全部路由页面后，仅
`workflows/index.vue` 是双根（v-if/v-else 双视图），已加单根包裹容器
（不改变布局与业务逻辑）。

### 6. KeepAlive 白名单机制

保留需求模板中的 `<KeepAlive :include="keepAlivePages">`，但默认
`keepAlivePages = []`（不缓存任何页面，行为与无 KeepAlive 完全一致，
不改变页面生命周期语义）。启用方式：页面 `defineOptions({ name })` +
加入数组。避免默认缓存改变既有页面 onMounted/滚动行为。

## 后果

- 所有路由页面获得统一过渡；浏览器前进/后退同样经过 Transition（key 随
  fullPath 变化），动画一致；
- 路由失败（懒加载 chunk 异常）由 `router.onError` 兜底清理遮罩并记录日志，
  不中断当前页面；项目暂无独立错误页，未新增路由（不修改路由路径）；
- 单测：`use-page-transition` 状态机 6 个用例（含快速连续导航/兜底销毁）；
  `default-layout.spec.ts` 改为轻量测试路由 + 真实 RouterView/Transition，
  避免全量并行时懒加载 chunk 拖垮 5s 超时。

## 替代方案

- **保留 motion-v AnimatePresence 增强**：中断处理可靠，但无法复用需求方
  给定的 CSS 类体系（.page-enter-*），且与「使用 Vue Router + Transition」
  的明确要求不符 → 拒绝。
- **遮罩 z-index 压到弹窗之下（如 45/65）**：会低于部分既有浮层
  （drawer z-40/50、toast z-70）导致扫描线不可见或层级混乱；当前方案以
  pointer-events:none + 瞬时存在规避遮挡问题，z-index 留 CSS 变量可调。
- **自动为页面直接子元素批量加分层动画**：首页直接子元素含装饰性光斑，
  全自动分层会误伤装饰元素且难控节奏 → 采用显式语义类。
