import { useEffect, useRef, useState } from 'react'
import { API_BASE, talk } from './talk.js'

// Chat with a professor agent from backend/ (POST /api/professors/:id/chat).

const SESSION = Math.random().toString(36).slice(2) // one conversation per page load
const SPEAK_MS_PER_CHAR = 45 // mouth keeps moving roughly as long as the reply takes to read

function inline(text, key) {
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// just enough Markdown for chat: paragraphs, bullet/numbered lists, bold/italic/code
function Markdown({ text }) {
  const blocks = []
  let list = null
  let para = []
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '), blocks.length)}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `${blocks.length}-${i}`)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }
  for (const line of text.split('\n')) {
    const b = /^\s*[-*•]\s+(.*)$/.exec(line)
    const n = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (b || n) {
      flushPara()
      if (!list || list.ordered !== !!n) {
        flushList()
        list = { ordered: !!n, items: [] }
      }
      list.items.push((b ?? n)[1])
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim().replace(/^#+\s*/, ''))
    }
  }
  flushPara()
  flushList()
  return <div className="md">{blocks}</div>
}

export default function ChatWindow({ profId, onClose }) {
  const [prof, setProf] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const body = useRef()
  const inputRef = useRef()

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/professors/${profId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((p) => {
        if (!alive) return
        setProf(p)
        setMessages((m) => (m.length ? m : [{ role: 'prof', text: p.greeting }]))
        talk.speakingUntil = performance.now() + p.greeting.length * SPEAK_MS_PER_CHAR
      })
      .catch(() => alive && setMessages([{ role: 'prof', text: "Can't reach the professor server. Start it with `uvicorn main:app --port 8002` in backend/.", error: true }]))
    return () => {
      alive = false
    }
  }, [profId])

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    inputRef.current?.focus()
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const send = async (e) => {
    e.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'me', text: q }])
    setBusy(true)
    try {
      const r = await fetch(`${API_BASE}/api/professors/${profId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, session_id: SESSION }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`)
      setMessages((m) => [...m, { role: 'prof', text: data.reply, tools: data.tools_used }])
      talk.speakingUntil = performance.now() + Math.min(12000, data.reply.length * SPEAK_MS_PER_CHAR)
    } catch (err) {
      setMessages((m) => [...m, { role: 'prof', text: `Couldn't get an answer (${err.message}).`, error: true }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const last = prof?.name.split(' ').slice(-1)[0] ?? ''
  return (
    <section className="chatwin" aria-label={`Chat with Professor ${last}`} onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <div className="avatar">{last.slice(0, 1) || '…'}</div>
        <div className="who">
          <strong>{prof ? `Prof. ${prof.name}` : 'Connecting…'}</strong>
          <span>{prof ? `${prof.courses[0] ?? ''} · ${prof.room}` : ''}</span>
        </div>
        <button className="x" onClick={onClose} aria-label="Close chat">×</button>
      </header>
      <div className="msgs" ref={body}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? ' err' : ''}`}>
            <div className="bubble">{m.role === 'prof' ? <Markdown text={m.text} /> : m.text}</div>
            {m.tools?.length > 0 && (
              <div className="tools">
                looked up: {m.tools.map((t) => <span key={t}>{t}</span>)}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg prof">
            <div className="bubble typing">
              <span className="spin" /> Prof. {last} is thinking…
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask Prof. ${last}…`}
          disabled={busy}
          aria-label="Message"
        />
        <button disabled={busy || !input.trim()}>Send</button>
      </form>
      <div className="hint">Esc or × to go back to walking</div>
    </section>
  )
}
