import { useState, useEffect, useRef } from 'react'
import { Plus, Stop, NotePencil, Trash, Clock, CheckCircle, Circle } from '@phosphor-icons/react'
import { getMeetings, startMeeting, endMeeting, saveMeetingNotes, deleteMeeting } from '../api'
import { formatDate } from '../format'
import { Panel } from './RecordParts'
import { canI } from '../permissions'

const btn = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors'
const dangerBtn = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors'
const primaryBtn = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors'

function useTick(active) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [active])
}

function duration(startedAt) {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function MeetingRow({ m, onEnd, onDelete, onNotes }) {
  useTick(m.status === 'recording')
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(m.notes || '')
  const [saving, setSaving] = useState(false)

  const saveNotes = async () => {
    setSaving(true)
    try { await onNotes(m.id, notes); setEditing(false) } finally { setSaving(false) }
  }

  return (
    <li className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/40">
        <span className={`flex items-center gap-1 text-[11px] font-medium ${m.status === 'recording' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {m.status === 'recording'
            ? <><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {duration(m.started_at)}</>
            : <><CheckCircle size={11} /> {formatDate(m.started_at)}</>}
        </span>
        {m.title && <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1">{m.title}</span>}
        <div className="flex gap-1 ml-auto shrink-0">
          {m.status === 'recording' && canI('leads.edit') && (
            <button onClick={() => onEnd(m.id)} className={dangerBtn}><Stop size={12} /> End</button>
          )}
          {m.status !== 'recording' && canI('leads.edit') && (
            <button onClick={() => setEditing(e => !e)} className={btn}><NotePencil size={12} /> Notes</button>
          )}
          {canI('leads.edit') && (
            <button onClick={() => onDelete(m.id)} className="p-1.5 rounded text-zinc-400 hover:text-red-500 transition-colors" title="Delete meeting">
              <Trash size={12} />
            </button>
          )}
        </div>
      </div>
      {(m.notes || editing) && (
        <div className="px-3 py-2">
          {editing ? (
            <div className="space-y-2">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} dir="auto"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 resize-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className={btn}>Cancel</button>
                <button onClick={saveNotes} disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{m.notes}</p>
          )}
        </div>
      )}
    </li>
  )
}

export default function MeetingsPanel({ contact, showToast }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const load = async () => {
    try {
      const rows = await getMeetings(contact.id)
      setMeetings(rows)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [contact.id])

  const start = async () => {
    setStarting(true)
    try {
      const m = await startMeeting(contact.id)
      setMeetings(prev => [m, ...prev])
    } catch (e) { showToast(e.message || 'Failed to start meeting', true) }
    setStarting(false)
  }

  const end = async (id) => {
    try {
      const updated = await endMeeting(id)
      setMeetings(prev => prev.map(m => m.id === id ? updated : m))
    } catch (e) { showToast(e.message || 'Failed to end meeting', true) }
  }

  const saveNotes = async (id, notes) => {
    try {
      const updated = await saveMeetingNotes(id, notes)
      setMeetings(prev => prev.map(m => m.id === id ? updated : m))
      showToast('Notes saved.')
    } catch (e) { showToast(e.message || 'Failed to save notes', true) }
  }

  const remove = async (id) => {
    try {
      await deleteMeeting(id)
      setMeetings(prev => prev.filter(m => m.id !== id))
    } catch (e) { showToast(e.message || 'Failed to delete', true) }
  }

  const hasRecording = meetings.some(m => m.status === 'recording')

  return (
    <Panel title={`Meetings (${meetings.length})`}
      action={canI('leads.edit') && !hasRecording && (
        <button onClick={start} disabled={starting} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50">
          <Plus size={11} weight="bold" /> {starting ? 'Starting…' : 'Start'}
        </button>
      )}>
      {loading
        ? <p className="text-xs text-zinc-400">Loading…</p>
        : meetings.length === 0
          ? <p className="text-xs text-zinc-500 dark:text-zinc-400">No meetings yet.</p>
          : (
            <ul className="space-y-2">
              {meetings.map(m => (
                <MeetingRow key={m.id} m={m} onEnd={end} onDelete={remove} onNotes={saveNotes} />
              ))}
            </ul>
          )}
    </Panel>
  )
}
