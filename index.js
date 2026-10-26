/**
 * dsh-recorder —— 录屏插件
 * ============================================================================
 * 热键（默认 Ctrl+Alt+R）开始 / 结束录制，用 ffmpeg 的 gdigrab 抓屏存 MP4。
 * 前端：设置 → 插件 → 录屏（状态、开始/停止、文件列表、快捷键）
 * 工具：rec_start / rec_stop / rec_status / rec_list
 *
 * 配置：~/.dsh/recorder/config.json  { hotkey, outDir, fps, crf, ffmpegPath }
 * ============================================================================
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'recorder'
export const inject = ['tools', 'webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(DSH_HOME, 'recorder')
const CONF = join(DIR, 'config.json')
const TRIGGER = join(DIR, 'trigger.txt')
const HOTLOG = join(DIR, 'hotkey.log')
const SCRIPT = join(HERE, 'scripts', 'hotkey.ps1')

const DEFAULTS = { hotkey: 'Ctrl+Alt+R', outDir: join(homedir(), 'Videos', 'dsh-rec'), fps: 30, crf: 23, ffmpegPath: 'ffmpeg' }

function readConf() { try { return { ...DEFAULTS, ...JSON.parse(readFileSync(CONF, 'utf8')) } } catch { return { ...DEFAULTS } } }
function writeConf(o) { mkdirSync(DIR, { recursive: true }); writeFileSync(CONF, JSON.stringify(o, null, 2), 'utf8') }

let proc = null
let currentFile = ''
let startedAt = 0
let hotkeyChild = null
let lastTriggerMtime = 0

function listFiles(dir, limit = 20) {
  try {
    return readdirSync(dir)
      .filter((f) => /\.(mp4|mkv|webm)$/i.test(f))
      .map((f) => { const p = join(dir, f); const s = statSync(p); return { name: f, path: p, size: s.size, mtime: s.mtimeMs } })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } catch { return [] }
}

function status() {
  return {
    recording: !!proc,
    file: currentFile || '',
    seconds: proc ? Math.round((Date.now() - startedAt) / 1000) : 0,
  }
}

function startRec(cfg) {
  if (proc) return { ok: false, error: '已经在录了' }
  const dir = cfg.outDir
  mkdirSync(dir, { recursive: true })
  const name = 'rec-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.mp4'
  const file = join(dir, name)
  const args = [
    '-y', '-f', 'gdigrab', '-framerate', String(cfg.fps || 30),
    '-i', 'desktop',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(cfg.crf || 23),
    '-pix_fmt', 'yuv420p', file,
  ]
  try {
    proc = spawn(cfg.ffmpegPath || 'ffmpeg', args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
  } catch (e) {
    proc = null
    return { ok: false, error: String(e?.message || e) }
  }
  proc.on('error', () => { proc = null })
  proc.on('exit', () => { proc = null })
  currentFile = file
  startedAt = Date.now()
  return { ok: true, file, ...status() }
}

function stopRec() {
  return new Promise((resolve) => {
    if (!proc) return resolve({ ok: false, error: '没在录' })
    const p = proc
    const file = currentFile
    const wait = setTimeout(() => { try { p.kill() } catch { /* ignore */ } }, 5000)
    p.on('exit', () => {
      clearTimeout(wait)
      proc = null
      resolve({ ok: true, file, ...status() })
    })
    try { p.stdin.write('q') } catch { try { p.kill() } catch { /* ignore */ } }
  })
}

function startHotkey(cfg) {
  if (hotkeyChild) { try { hotkeyChild.kill() } catch { /* ignore */ } hotkeyChild = null }
  if (!existsSync(SCRIPT)) return
  try {
    mkdirSync(DIR, { recursive: true })
    hotkeyChild = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', SCRIPT, '-Hotkey', cfg.hotkey, '-TriggerFile', TRIGGER, '-LogFile', HOTLOG,
    ], { windowsHide: true, stdio: 'ignore' })
    hotkeyChild.on('exit', () => { hotkeyChild = null })
  } catch { hotkeyChild = null }
}

/** 监听触发文件：热键进程往里追加一行，这里就切一次状态 */
function watchTrigger() {
  setInterval(() => {
    try {
      if (!existsSync(TRIGGER)) return
      const m = statSync(TRIGGER).mtimeMs
      if (m !== lastTriggerMtime) {
        const first = lastTriggerMtime === 0
        lastTriggerMtime = m
        if (first) return
        const cfg = readConf()
        if (proc) stopRec()
        else startRec(cfg)
      }
    } catch { /* ignore */ }
  }, 400)
}

const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
}
const defineTool = (o) => o
const sendJson = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}
const readBody = (req) => new Promise((r) => {
  let b = ''
  req.on('data', (d) => { b += d })
  req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } })
})

export function apply(ctx) {
  mkdirSync(DIR, { recursive: true })
  const cfg0 = readConf()
  startHotkey(cfg0)
  watchTrigger()

  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: textOutput,
    async execute(args) {
      try { return await spec.execute(args || {}) } catch (e) { return { ok: false, error: String(e?.message || e) } }
    },
  }))

  tool({
    name: 'rec_start',
    description: '开始录屏（全屏，ffmpeg gdigrab）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() { return startRec(readConf()) },
  })

  tool({
    name: 'rec_stop',
    description: '停止录屏并保存 MP4。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() { return await stopRec() },
  })

  tool({
    name: 'rec_status',
    description: '看现在有没有在录、录了多久、文件在哪。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() { return { ok: true, ...status() } },
  })

  tool({
    name: 'rec_list',
    description: '列出最近的录像文件。',
    parameters: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
    async execute({ limit = 20 }) {
      const cfg = readConf()
      const files = listFiles(cfg.outDir, Math.min(Math.max(Number(limit) || 20, 1), 100))
      return { ok: true, dir: cfg.outDir, count: files.length, files }
    },
  })

  const handle = async (req, res, url) => {
    const p = (url.pathname.replace(/^\/api\/rec/, '') || '/')
    const method = req.method || 'GET'

    if (p === '/config' && method === 'GET') return sendJson(res, 200, { ok: true, ...readConf(), ...status() })
    if (p === '/config' && method === 'POST') {
      const b = await readBody(req)
      const c = readConf()
      if (typeof b.hotkey === 'string' && b.hotkey.trim()) c.hotkey = b.hotkey.trim()
      if (typeof b.outDir === 'string' && b.outDir.trim()) c.outDir = b.outDir.trim()
      if (typeof b.fps === 'number') c.fps = Math.max(5, Math.min(60, Math.round(b.fps)))
      if (typeof b.crf === 'number') c.crf = Math.max(0, Math.min(51, Math.round(b.crf)))
      if (typeof b.ffmpegPath === 'string' && b.ffmpegPath.trim()) c.ffmpegPath = b.ffmpegPath.trim()
      writeConf(c)
      startHotkey(c)
      return sendJson(res, 200, { ok: true, ...c })
    }
    if (p === '/start' && method === 'POST') return sendJson(res, 200, startRec(readConf()))
    if (p === '/stop' && method === 'POST') return sendJson(res, 200, await stopRec())
    if (p === '/status' && method === 'GET') return sendJson(res, 200, { ok: true, ...status() })
    if (p === '/list' && method === 'GET') {
      const c = readConf()
      return sendJson(res, 200, { ok: true, dir: c.outDir, files: listFiles(c.outDir, 30) })
    }
    if (p === '/file' && method === 'GET') {
      const name = (url.searchParams.get('name') || '').replace(/[\\/]/g, '')
      const c = readConf()
      const fp = join(c.outDir, name)
      try {
        const buf = readFileSync(fp)
        res.statusCode = 200
        res.setHeader('content-type', 'video/mp4')
        res.end(buf)
      } catch { sendJson(res, 404, { ok: false }) }
      return
    }
    return sendJson(res, 404, { ok: false, error: `unknown ${method} ${p}` })
  }

  try {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/api/rec', handler: async (req, res) => {
      try { await handle(req, res, new URL(req.url, 'http://127.0.0.1')) }
      catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
    } }), 'recorder: /api/rec 路由')
  } catch { /* ignore */ }

  ctx.effect(() => () => { try { if (proc) proc.stdin.write('q') } catch { /* ignore */ } try { if (hotkeyChild) hotkeyChild.kill() } catch { /* ignore */ } }, 'recorder: 收尾')
}
