/**
 * dsh-recorder —— 浏览器半端：设置里的一页「录屏」
 */
window.__ModuleLoader__.load({
  id: 'dsh-recorder',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/api/rec'

    const getJson = async (url) => {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }
    const postJson = async (url, body) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }

    const CSS = `
[data-rc-wrap]{display:flex;flex-direction:column;gap:12px;padding:6px 2px 24px;font-size:13px}
[data-rc-row]{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
[data-rc-label]{width:96px;opacity:.85}
[data-rc-input]{flex:1;min-width:200px;padding:6px 9px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-size:13px}
[data-rc-btn]{padding:6px 14px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;font-size:13px}
[data-rc-btn]:hover{background:rgba(127,127,127,.12)}
[data-rc-btn][data-danger]{border-color:rgba(220,80,80,.6);color:rgb(220,120,120)}
[data-rc-badge]{font-size:12px;padding:3px 10px;border-radius:999px;background:rgba(127,127,127,.2)}
[data-rc-red]{background:rgba(220,70,70,.3)}
[data-rc-msg]{font-size:12px;opacity:.78;min-height:16px}
[data-rc-note]{font-size:12px;opacity:.6;line-height:1.6}
[data-rc-table]{width:100%;border-collapse:collapse;font-size:12px}
[data-rc-table] th,[data-rc-table] td{text-align:left;padding:5px 6px;border-bottom:1px solid rgba(127,127,127,.18)}
`

    function Panel() {
      const [cfg, setCfg] = React.useState({ hotkey: 'Ctrl+Alt+R', outDir: '', fps: 30, crf: 23 })
      const [st, setSt] = React.useState({ recording: false, seconds: 0, file: '' })
      const [files, setFiles] = React.useState([])
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = async () => {
        try {
          const c = await getJson(API + '/config')
          setCfg(c)
          setSt(c)
          const l = await getJson(API + '/list')
          setFiles(l.files || [])
        } catch (e) { setMsg('读取失败：' + e.message) }
      }
      React.useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [])

      const save = async () => {
        setBusy(true)
        try {
          const r = await postJson(API + '/config', cfg)
          setMsg(r.ok ? '已保存' : '保存失败')
          await load()
        } catch (e) { setMsg('保存失败：' + e.message) }
        setBusy(false)
      }

      const toggle = async () => {
        setBusy(true)
        try {
          const r = st.recording ? await postJson(API + '/stop', {}) : await postJson(API + '/start', {})
          setMsg(r.ok ? (st.recording ? '已停止：' + r.file : '开始录制：' + r.file) : '失败：' + (r.error || ''))
          await load()
        } catch (e) { setMsg('出错：' + e.message) }
        setBusy(false)
      }

      const mmss = (s) => {
        const m = Math.floor(s / 60), ss = s % 60
        return m + ':' + String(ss).padStart(2, '0')
      }

      return h('div', { 'data-rc-wrap': '' },
        h('div', { 'data-rc-note': '' },
          '用 ffmpeg 的 gdigrab 录整个屏幕。按快捷键开始/结束，或者点下面的按钮。录像存成 MP4。'),

        h('div', { 'data-rc-row': '' },
          h('span', { 'data-rc-badge': '', 'data-rc-red': st.recording ? '' : undefined },
            st.recording ? '● 录制中 ' + mmss(st.seconds) : '● 空闲'),
          h('button', { 'data-rc-btn': '', 'data-danger': st.recording ? '' : undefined, onClick: toggle, disabled: busy },
            st.recording ? '停止并保存' : '开始录制'),
          h('button', { 'data-rc-btn': '', onClick: load, disabled: busy }, '刷新'),
        ),

        h('div', { 'data-rc-row': '' },
          h('span', { 'data-rc-label': '' }, '快捷键'),
          h('input', { 'data-rc-input': '', value: cfg.hotkey || '', onChange: (e) => setCfg({ ...cfg, hotkey: e.target.value }) }),
        ),

        h('div', { 'data-rc-row': '' },
          h('span', { 'data-rc-label': '' }, '保存目录'),
          h('input', { 'data-rc-input': '', value: cfg.outDir || '', onChange: (e) => setCfg({ ...cfg, outDir: e.target.value }) }),
        ),

        h('div', { 'data-rc-row': '' },
          h('span', { 'data-rc-label': '' }, '帧率 / 质量'),
          h('input', { 'data-rc-input': '', type: 'number', value: cfg.fps || 30, style: { maxWidth: 90 }, onChange: (e) => setCfg({ ...cfg, fps: Number(e.target.value) }) }),
          h('input', { 'data-rc-input': '', type: 'number', value: cfg.crf || 23, style: { maxWidth: 90 }, onChange: (e) => setCfg({ ...cfg, crf: Number(e.target.value) }) }),
          h('span', { 'data-rc-note': '' }, 'CRF 越小越清晰、文件越大（18–28 常用）'),
        ),

        h('div', { 'data-rc-row': '' },
          h('button', { 'data-rc-btn': '', onClick: save, disabled: busy }, '保存设置'),
        ),

        h('div', { 'data-rc-msg': '' }, msg),

        files.length
          ? h('table', { 'data-rc-table': '' },
            h('thead', null, h('tr', null, h('th', null, '文件'), h('th', null, '大小'), h('th', null, '时间'))),
            h('tbody', null, files.slice(0, 10).map((f, i) => h('tr', { key: i },
              h('td', null, f.name),
              h('td', null, (f.size / 1048576).toFixed(1) + ' MB'),
              h('td', null, new Date(f.mtime).toLocaleString()),
            ))),
          )
          : h('div', { 'data-rc-note': '' }, '还没有录像。'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-recorder')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-recorder: 设置页样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'recorder', order: 48, label: '录屏' },
          () => h(Panel),
        ))
      },
    }
  },
})
