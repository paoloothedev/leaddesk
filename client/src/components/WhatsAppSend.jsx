import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, PaperPlaneTilt, Spinner, Clock } from '@phosphor-icons/react'
import { getTemplates, createJob } from '../api'

export default function WhatsAppSend({ leads, campaignName, close, showToast }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [delay, setDelay] = useState({ min: 1, max: 5 })

  useEffect(() => {
    (async () => { try { const t = await getTemplates(); setTemplates(t) } catch {} })()
  }, [])

  const handleTemplate = (id) => {
    setSelectedTemplate(id)
    const t = templates.find(x => x.id === id)
    if (t) setMessage(t.content)
  }

  const handleCreateJob = async () => {
    if (!message.trim()) { showToast('Write a message first.', true); return }
    setSending(true)
    try {
      const leadsData = leads.map(l => ({ id: l.id, phone: l.phone }))
      await createJob({
        campaignId: campaignName || null,
        message: message.trim(),
        leads: leadsData,
        delayMin: delay.min,
        delayMax: delay.max,
      })
      showToast(`Broadcast job created for ${leads.length} leads. View progress in Settings > Broadcast Jobs.`)
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
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Send WhatsApp</h2>
          <button onClick={close} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="mb-4">
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Template</label>
            <select value={selectedTemplate} onChange={e => handleTemplate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors">
              <option value="">Select a template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} disabled={sending}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors disabled:opacity-50"
              placeholder="Type your message here..." />
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Delay between messages (seconds)</label>
            <div className="flex items-center gap-3">
              <input type="number" value={delay.min} onChange={e => setDelay(d => ({ ...d, min: parseInt(e.target.value) || 1 }))} min="0"
                className="w-24 h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors" placeholder="Min" />
              <span className="text-xs text-zinc-400 dark:text-zinc-500">to</span>
              <input type="number" value={delay.max} onChange={e => setDelay(d => ({ ...d, max: parseInt(e.target.value) || 5 }))} min="0"
                className="w-24 h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors" placeholder="Max" />
              <Clock size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={close}
              className="flex-1 inline-flex items-center justify-center h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
              Cancel
            </button>
            <button onClick={handleCreateJob} disabled={sending || !message.trim()}
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
