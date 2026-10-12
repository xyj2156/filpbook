/**
 * React 封装：children 的每个子节点 = 一个页码面（D-01），
 * 用 createPortal 渲染进 core 的宿主 div（D-04：core 只借不还销毁）。
 *
 * 契约（D-15）：
 *   - 除 `page` 外的 props 仅挂载时生效（选项快照，改尺寸/模式请换 key 重建）；
 *   - `page` 受控：外部变更走 goTo，core 的 change 走 onPageChange；
 *   - `apiRef` 拿到 { goTo, book }（不用 React 19 的 ref-as-prop，peer 放宽到 18）。
 *
 * 卸载顺序：React 先随组件树撤掉 portal 内容，effect cleanup 再 destroy()，
 * 与 D-04「框架先撤销内容」一致。
 */

import {
  Children,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  FlipBook as CoreFlipBook,
  type FlipBookOptions,
} from '@x-ac/filpbook-core'

export interface FlipBookProps
  extends Pick<
    FlipBookOptions,
    | 'pageCount' | 'width' | 'height' | 'display' | 'direction' | 'startPage'
    | 'blankPage' | 'gradients' | 'domWindow' | 'interactive' | 'cornerSize'
    | 'hover' | 'duration' | 'fit'
  > {
  /** 受控当前页；变更走 goTo */
  page?: number
  /** core 换页落地时回调（拖拽/点按/动画完成后） */
  onPageChange?: (page: number) => void
  /** 命令式入口 */
  apiRef?: RefObject<FlipBookApi | null>
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** data-* 等属性透传到容器 div（取证钩子用） */
  [key: `data-${string}`]: string | number | undefined
}

export interface FlipBookApi {
  /** 跳到某页（无动画，等价 core goTo） */
  goTo(page: number): boolean
  /** core 实例（高级控制直通） */
  readonly book: CoreFlipBook | null
}

export function FlipBook(props: FlipBookProps): ReactNode {
  const {
    page, onPageChange, apiRef, className, style, children,
    pageCount, width, height, display, direction, startPage, blankPage,
    gradients, domWindow, interactive, cornerSize, hover, duration, fit,
    ...dom
  } = props
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [book, setBook] = useState<CoreFlipBook | null>(null)

  // 回调可能换身份，core 里始终走最新值
  const changeRef = useRef(onPageChange)
  changeRef.current = onPageChange

  // 选项快照：仅挂载时建实例（StrictMode 双跑安全：先销毁旧的）
  useEffect(() => {
    if (!mountRef.current) return
    const b = new CoreFlipBook(mountRef.current, {
      pageCount, width, height, display, direction, startPage, blankPage,
      gradients, domWindow, interactive, cornerSize, hover, duration, fit,
    })
    for (let p = 1; p <= b.total; p++) b.hostOf(p)
    b.on('change', (p) => changeRef.current?.(p))
    setBook(b)
    const api: FlipBookApi = {
      goTo: (target: number) => b.goTo(target),
      get book() {
        return b
      },
    }
    if (apiRef) apiRef.current = api
    return () => {
      if (apiRef && apiRef.current === api) apiRef.current = null
      setBook(null)
      b.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 快照语义，见文件头
  }, [])

  useEffect(() => {
    if (book && typeof page === 'number' && page !== book.page) book.goTo(page)
  }, [book, page])

  const bookW = display === 'single' ? width : width * 2
  const pages = Children.toArray(children)

  return (
    <div
      {...dom}
      ref={mountRef}
      className={className}
      style={{ width: bookW, height, ...style }}
    >
      {book != null &&
        pages.map((child, i) => {
          const host = i < book.total ? book.hostOf(i + 1) : null
          return host ? createPortal(child, host) : null
        })}
    </div>
  )
}

export default FlipBook
