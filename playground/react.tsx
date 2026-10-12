// React playground：children = 页码面，page + onPageChange 受控。
// query：pages / page / display / direction / go=N（挂载后 goTo）/ unmount=1 / dump=1
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FlipBook, type FlipBookApi } from '@x-ac/filpbook-react'
import { dumpdom } from '../tools/dumpdom'

const q = new URLSearchParams(location.search)
const pageCount = Number(q.get('pages') ?? 6)
const display = q.get('display') === 'single' ? 'single' : 'double'
const direction = q.get('direction') === 'rtl' ? 'rtl' : 'ltr'
const startPage = Number(q.get('page') ?? 1)

function Demo(): ReactNode {
  const [page, setPage] = useState(startPage)
  const api = useRef<FlipBookApi | null>(null)

  useEffect(() => {
    const go = Number(q.get('go') ?? 0)
    if (go) api.current?.goTo(go)
  }, [])

  const pages = Array.from({ length: pageCount }, (_, i) => (
    <div
      key={i}
      className="page"
      style={{ background: `hsl(${((i + 1) * 26) % 360} 40% ${(i + 1) % 2 ? 28 : 40}%)` }}
    >
      <div className="probe">
        <b>第 {i + 1} 页</b>
        <span>{display} · {direction}</span>
      </div>
    </div>
  ))

  const b = api.current?.book
  return (
    <>
      <div id="info">
        {`react · page ${page}` + (b ? ` · view [${b.view().join(',')}]` : '')}
      </div>
      <FlipBook
        apiRef={api}
        data-demo="stage"
        pageCount={pageCount}
        width={400}
        height={600}
        display={display}
        direction={direction}
        page={page}
        onPageChange={setPage}
      >
        {pages}
      </FlipBook>
    </>
  )
}

const root = createRoot(document.getElementById('app')!)
root.render(<Demo />)

if (q.get('unmount')) setTimeout(() => root.unmount(), 600)
if (q.get('dump')) setTimeout(() => dumpdom(document.getElementById('app')!), 800)
