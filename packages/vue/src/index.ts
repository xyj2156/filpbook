/**
 * Vue 3 封装：默认插槽的每个根节点 = 一个页码面（D-01），
 * 用 <Teleport> 渲染进 core 的宿主 div（D-04：core 只借不还销毁）。
 *
 * 契约（D-15）：
 *   - 除 `page` 外的 props 仅挂载时生效（选项快照，改尺寸/模式请换 key 重建）；
 *   - `page` 受控：外部变更走 goTo，core 的 change 走 update:page（v-model:page）；
 *   - 模板 ref 拿到 { goTo, book }；`book` 是 core 实例，高级控制直通。
 *
 * 卸载顺序：destroy 挂在 onUnmounted——插槽内容由 Teleport 先撤，再拆 core，
 * 与 D-04「框架先撤销内容」一致。
 */

import {
  Comment, Fragment, Teleport, defineComponent, h, onMounted, onUnmounted,
  ref, shallowRef, watch,
  type PropType, type VNode,
} from 'vue'
import { FlipBook as CoreFlipBook, type Direction, type Display } from '@x-ac/filpbook-core'

/** 插槽子节点 → 页码面序列：跳过注释（v-if 占位）与空白文本，Fragment 展平 */
function flattenPages(vnodes: VNode[]): VNode[] {
  const out: VNode[] = []
  for (const vn of vnodes) {
    if (vn.type === Comment) continue
    if (vn.type === Fragment) {
      if (Array.isArray(vn.children)) out.push(...flattenPages(vn.children as VNode[]))
      continue
    }
    if (typeof vn.children === 'string' && vn.children.trim() === '') continue
    out.push(vn)
  }
  return out
}

export interface FlipBookExpose {
  /** 跳到某页（无动画，等价 core goTo） */
  goTo(page: number): boolean
  /** core 实例（高级控制直通） */
  readonly book: CoreFlipBook | null
}

export const FlipBook = defineComponent({
  name: 'FlipBook',
  inheritAttrs: false,
  props: {
    pageCount: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    display: { type: String as PropType<Display>, default: 'double' },
    direction: { type: String as PropType<Direction>, default: 'ltr' },
    startPage: { type: Number, default: undefined },
    blankPage: { type: Boolean, default: false },
    gradients: { type: Boolean, default: true },
    domWindow: { type: Number, default: undefined },
    interactive: { type: Boolean, default: true },
    cornerSize: { type: Number, default: undefined },
    hover: { type: Boolean, default: true },
    duration: { type: Number, default: undefined },
    fit: { type: String as PropType<'contain' | 'none'>, default: 'contain' },
    /** 受控当前页（v-model:page）；未传时用 startPage 起步 */
    page: { type: Number, default: undefined },
  },
  emits: {
    'update:page': (_page: number) => true,
    change: (_page: number) => true,
  },
  setup(props, { slots, emit, expose, attrs }) {
    const mount = ref<HTMLElement | null>(null)
    const book = shallowRef<CoreFlipBook | null>(null)

    onMounted(() => {
      if (!mount.value) return
      const b = new CoreFlipBook(mount.value, {
        pageCount: props.pageCount,
        width: props.width,
        height: props.height,
        display: props.display,
        direction: props.direction,
        startPage: props.page ?? props.startPage,
        blankPage: props.blankPage,
        gradients: props.gradients,
        domWindow: props.domWindow,
        interactive: props.interactive,
        cornerSize: props.cornerSize,
        hover: props.hover,
        duration: props.duration,
        fit: props.fit,
      })
      // 先建好全部宿主，Teleport 挂载时目标必已存在（D-04：只搬不销毁）
      for (let p = 1; p <= b.total; p++) b.hostOf(p)
      b.on('change', (p) => {
        emit('update:page', p)
        emit('change', p)
      })
      book.value = b
    })

    onUnmounted(() => {
      book.value?.destroy()
      book.value = null
    })

    watch(
      () => props.page,
      (p) => {
        const b = book.value
        if (b && typeof p === 'number' && p !== b.page) b.goTo(p)
      },
    )

    const api: FlipBookExpose = {
      goTo: (p: number) => book.value?.goTo(p) ?? false,
      get book() {
        return book.value
      },
    }
    expose(api)

    return () => {
      const b = book.value
      const pages = flattenPages(slots.default?.() ?? [])
      const teleports: VNode[] = []
      if (b) {
        for (let i = 0; i < pages.length && i < b.total; i++) {
          const host = b.hostOf(i + 1)
          if (host) teleports.push(h(Teleport, { to: host }, () => [pages[i]]))
        }
      }
      const bookW = props.display === 'single' ? props.width : props.width * 2
      return h(
        'div',
        {
          ...attrs,
          ref: mount,
          class: attrs.class,
          style: { width: `${bookW}px`, height: `${props.height}px`, ...(attrs.style as object) },
        },
        teleports,
      )
    }
  },
})

export default FlipBook
