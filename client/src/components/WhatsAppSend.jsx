import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, PaperPlaneTilt, Spinner, Plus, Trash } from '@phosphor-icons/react'
import { getTemplates, createJob } from '../api'

export default function WhatsAppSend({ leads, campaignName, close, showToast }) {
  const [messages, setMessages] = useState([''])
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    (async () => { try { const t = await getTemplates(); setTemplates(t) } catch {} })()
  }, [])

  const handleTemplate = (id, msgIndex) => {
    const t = templates.find(x => x.id === id)
    if (t) {
      const next = [...messages]
      next[msgIndex] = t.content
      setMessages(next)
    }
  }

  const addMessage = () => setMessages([...messages, ''])
  const removeMessage = (i) => {
    if (messages.length <= 1) return
    setMessages(messages.filter((_, idx) => idx !== i))
  }
  const updateMessage = (i, val) => {
    const next = [...messages]
    next[i] = val
    setMessages(next)
  }

  const handleCreateJob = async () => {
    const validMessages = messages.filter(m => m.trim())
    if (!validMessages.length) { showToast('Write at least one message.', true); return }
    setSending(true)
    try {
      const leadsData = leads.map(l => ({ id: l.id, phone: l.phone }))
      await createJob({
        campaignId: campaignName || null,
        message: validMessages.length === 1 ? validMessages[0] : JSON.stringify(validMessages),
        leads: leadsData,
      })
      const seq = validMessages.length > 1 ? ` (${validMessages.length} messages in sequence)` : ''
      showToast(`Broadcast job created for ${leads.length} leads${seq}. Anti-blocking delays are automatic.`)
      close()
    } catch (err) { showToast(err.message || 'Failed to create job.', true) }
    setSending(false)
  }

  const totalLeads = leads.length

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={close}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 25 }}
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg flex flex-col shadow-xl max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Send WhatsApp</h2>
          <button onClick={close} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {messages.map((msg, i) => (
            <div key={i} className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {messages.length > 1 ? `Message ${i + 1} of ${messages.length}` : 'Message'}
                </label>
                {messages.length > 1 && (
                  <button onClick={() => removeMessage(i)} className="text-zinc-400 hover:text-red-500 transition-colors">
                    <Trash size={12} />
                  </button>
                )}
              </div>
              {templates.length > 0 && (
                <select value="" onChange={e => { handleTemplate(e.target.value, i); e.target.value = '' }}
                  className="w-full h-8 px-3 mb-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[10px] text-zinc-500 dark:text-zinc-400 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors">
                  <option value="">Fill from template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <textarea value={msg} onChange={e => updateMessage(i, e.target.value)} rows={3} disabled={sending}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors disabled:opacity-50"
                placeholder="Type your message here..." />
            </div>
          ))}

          <button onClick={addMessage}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors mb-3">
            <Plus size={12} weight="bold" />
            Add message step
          </button>

          <div className="flex flex-wrap gap-1 mb-3">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 self-center">Variables:</span>
            {['{{name}}', '{{phone}}', '{{email}}', '{{notes}}', '{{location}}'].map(v => (
              <button key={v} onClick={() => {
                const idx = messages.findIndex(m => m === messages[messages.length - 1])
                const last = messages.length - 1
                updateMessage(last, messages[last] + (messages[last] && !messages[last].endsWith(' ') ? ' ' : '') + v)
              }}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                {v}
              </button>
            ))}
          </div>

          {messages.filter(m => m.trim()).length > 1 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mb-3 px-1">
              Each lead will receive messages in sequence (msg 1, then msg 2, then next lead).
            </p>
          )}

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-5 px-1">
            Delays are automatic: human-like typing simulation, variable gaps between messages, and long breaks every 8-15 messages.
          </p>

          <div className="flex gap-3">
            <button onClick={close}
              className="flex-1 inline-flex items-center justify-center h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
              Cancel
            </button>
            <button onClick={handleCreateJob} disabled={sending || !messages.some(m => m.trim())}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]">
              {sending ? (
                <><Spinner size={14} className="animate-spin" /> Creating job...</>
              ) : (
                <><PaperPlaneTilt size={14} weight="fill" /> Broadcast to {totalLeads} leads</>
              )}
            </button>
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-4 text-center">
            Job runs in the background. Track progress in Settings &rarr; Broadcast Jobs.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
