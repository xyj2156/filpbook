// Vue playground：默认插槽 = 页码面，v-model:page 受控。
// query：pages / page / display / direction / go=N（挂载后 goTo）/ unmount=1 / dump=1
import { createApp, h, onMounted, ref } from 'vue'
import { FlipBook, type FlipBookExpose } from '@x-ac/filpbook-vue'
import { dumpdom } from '../tools/dumpdom'

const q = new URLSearchParams(location.search)
const pageCount = Number(q.get('pages') ?? 6)
const display = q.get('display') === 'single' ? 'single' : 'double'
const direction = q.get('direction') === 'rtl' ? 'rtl' : 'ltr'
const startPage = Number(q.get('page') ?? 1)

const page = ref(startPage)
const api = ref<FlipBookExpose | null>(null)
let app: ReturnType<typeof createApp>

function pages(): ReturnType<typeof h>[] {
  return Array.from({ length: pageCount }, (_, i) =>
    h(
      'div',
      { class: 'page', style: `background: hsl(${((i + 1) * 26) % 360} 40% ${(i + 1) % 2 ? 28 : 40}%)` },
      [
        h('div', { class: 'probe' }, [
          h('b', `第 ${i + 1} 页`),
          h('span', `${display} · ${direction}`),
        ]),
      ],
    ),
  )
}

app = createApp({
  setup() {
    onMounted(() => {
      const go = Number(q.get('go') ?? 0)
      if (go) api.value?.goTo(go)
      if (q.get('unmount')) setTimeout(() => app.unmount(), 600)
      if (q.get('dump'))
        setTimeout(() => dumpdom(document.getElementById('app')!), 800)
    })

    return () => {
      const b = api.value?.book
      return [
        h('div', { id: 'info' }, `vue · page ${page.value}` + (b ? ` · view [${b.view().join(',')}]` : '')),
        h(
          FlipBook,
          {
            ref: api,
            'data-demo': 'stage',
            pageCount,
            width: 400,
            height: 600,
            display,
            direction,
            page: page.value,
            'onUpdate:page': (p: number) => {
              page.value = p
            },
          },
          () => pages(),
        ),
      ]
    }
  },
})

app.mount('#app')
