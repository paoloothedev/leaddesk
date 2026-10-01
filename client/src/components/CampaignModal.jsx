import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Copy, Plus, Trash, CaretRight, PaperPlaneTilt, UserPlus, MagnifyingGlass } from '@phosphor-icons/react'
import { getCampaigns, deleteCampaign, addLeadsToCampaign, removeLeadFromCampaign, bulkAction } from '../api'
import { canI } from '../permissions'
import WhatsAppSend from './WhatsAppSend'

export default function CampaignModal({ campId, stages, close, showToast, refresh, openLeadModal }) {
  const [campaign, setCampaign] = useState(null)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadCampaign = useCallback(async () => {
    if (!campId) return
    setLoading(true)
    try {
      const camps = await getCampaigns()
      const c = camps.find(x => x.id === campId)
      setCampaign(c || null)
    } catch {}
    setLoading(false)
  }, [campId])

  useEffect(() => { loadCampaign() }, [loadCampaign])

  useEffect(() => {
    const handleClick = (e) => {
      if (e.target.classList.contains('modal-overlay')) close()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [close])

  const handleDelete = async () => {
    if (!campaign) return
    if (!confirm(`Delete campaign "${campaign.name}"? Leads will be freed up.`)) return
    try {
      await deleteCampaign(campaign.id)
      showToast('Campaign deleted.')
      close()
      refresh()
    } catch { showToast('Failed to delete campaign.', true) }
  }

  const handleCopyPhones = () => {
    if (!campaign) return
    const phones = (campaign.leads || []).filter(l => l.phone).map(l => l.phone)
    const text = document.createElement('textarea')
    text.value = phones.join('\n')
    document.body.appendChild(text)
    text.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(text)
    showToast(`Copied ${phones.length} phone numbers.`)
  }

  const handleAddMore = async () => {
    if (!campaign) return
    const howMany = prompt('How many more leads to try adding?', '20')
    const n = parseInt(howMany)
    if (!n || n <= 0) return
    try {
      const result = await addLeadsToCampaign(campaign.id, null, n, false)
      if (result.added > 0) {
        showToast(`Added ${result.added} leads to "${campaign.name}".`)
      } else {
        showToast('No more eligible leads available.', true)
      }
      loadCampaign()
      refresh()
    } catch { showToast('No more eligible leads available.', true) }
  }

  const handleRemoveLead = async (leadId, leadName) => {
    if (!confirm(`Remove "${leadName}" from this campaign?`)) return
    try {
      await removeLeadFromCampaign(campaign.id, leadId)
      showToast('Lead removed from campaign.')
      loadCampaign()
      refresh()
    } catch { showToast('Failed to remove lead.', true) }
  }

  const handleConvertAll = async () => {
    if (!campaign) return
    const leads = campaign.leads || []
    if (!leads.length) { showToast('No leads to convert.', true); return }
    if (!confirm(`Convert ${leads.length} leads to CRM clients?`)) return
    try {
      const ids = leads.map(l => l.id)
      await bulkAction(ids, 'convert')
      showToast(`Converted ${ids.length} leads to CRM clients.`)
      refresh()
    } catch { showToast('Failed to convert leads.', true) }
  }

  const handleConvertLead = async (leadId, leadName) => {
    try {
      await bulkAction([leadId], 'convert')
      showToast(`"${leadName}" moved to CRM.`)
      loadCampaign()
      refresh()
    } catch { showToast('Failed to convert lead.', true) }
  }

  const getStage = (id) => stages.find(s => s.id === id)

  if (loading || !campaign) return null

  const q = search.toLowerCase().trim()
  const filteredLeads = q
    ? (campaign.leads || []).filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.notes || '').toLowerCase().includes(q) ||
        (l.tags || []).some(t => (t.name || '').toLowerCase().includes(q)) ||
        (getStage(l.stage_id)?.name || '').toLowerCase().includes(q)
      )
    : (campaign.leads || [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm modal-overlay" onClick={close}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 25 }}
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{campaign.name}</h2>
          <button onClick={close} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-5">Created {new Date(campaign.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} &middot; {campaign.leads?.length || 0} leads</p>
          <div className="flex flex-wrap gap-3 mb-5">
            <button onClick={handleCopyPhones} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
              <Copy size={14} />
              Copy all phone numbers
            </button>
            <button onClick={handleAddMore} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
              <Plus size={14} weight="bold" />
              Add more leads
            </button>
            {(campaign.leads || []).some(l => l.phone) && canI('campaigns.send') && (
              <button onClick={() => setShowWhatsApp(true)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
                <PaperPlaneTilt size={14} weight="fill" />
                Send WhatsApp
              </button>
            )}
            <button onClick={handleConvertAll} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors active:scale-[0.98]">
              Convert all to CRM
            </button>
            <button onClick={handleDelete} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.98] ml-auto">
              <Trash size={14} />
              Delete campaign
            </button>
          </div>
          <div className="mb-3 relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Name</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Tags</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Stage</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Notes</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => {
                  const stage = getStage(l.stage_id)
                  return (
                    <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 text-xs font-medium text-zinc-900 dark:text-zinc-100">{l.name}</td>
                      <td className="py-3 px-4 text-xs text-zinc-500 dark:text-zinc-400">{l.phone || <span className="text-zinc-400 dark:text-zinc-600">none</span>}</td>
                      <td className="py-3 px-4">
                        {l.tags?.length ? (
                          <div className="flex gap-0.5 flex-wrap max-w-[100px]">
                            {l.tags.map(t => (
                              <span key={t.id} className="inline-block px-1 h-4 rounded text-[9px] font-bold text-white" style={{ background: t.color }}>{t.name}</span>
                            ))}
                          </div>
                        ) : <span className="text-zinc-400 dark:text-zinc-600">&mdash;</span>}
                      </td>
                      <td className="py-3 px-4">
                        {stage ? <span className="inline-block px-1.5 h-5 rounded text-[10px] font-semibold text-white" style={{ background: stage.color }}>{stage.name}</span> : <span className="text-zinc-400 dark:text-zinc-600">&mdash;</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-500 dark:text-zinc-400 max-w-[120px] truncate">{(l.notes || '').slice(0, 40)}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <button onClick={() => openLeadModal(l.id)} className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.95]">
                            <CaretRight size={12} />
                          </button>
                          <button onClick={() => handleConvertLead(l.id, l.name)} title="Move to CRM" className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-medium border border-blue-200 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 transition-colors active:scale-[0.95]">
                            <UserPlus size={12} />
                          </button>
                          <button onClick={() => handleRemoveLead(l.id, l.name)} className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-medium border border-red-200 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.95]">
                            <Trash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
      {showWhatsApp && (
        <WhatsAppSend leads={campaign.leads || []} campaignName={campaign.name} close={() => setShowWhatsApp(false)} showToast={showToast} />
      )}
    </div>
  )
}
