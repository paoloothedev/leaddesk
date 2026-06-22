import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { PlusCircle, CalendarBlank, CheckCircle, ListBullets, WhatsappLogo, EnvelopeSimple } from '@phosphor-icons/react'
import { getCampaigns, createCampaign } from '../api'
import BroadcastJobs from './BroadcastJobs'
import EmailCampaigns from './EmailCampaigns'

const TABS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo },
  { id: 'email', label: 'Email', icon: EnvelopeSimple },
]

function fmtDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } }
}

function WhatsAppTab({ refreshId, openCampModal, showToast, refresh }) {
  const [campaigns, setCampaigns] = useState([])
  const [newName, setNewName] = useState('')
  const [newCount, setNewCount] = useState(100)

  const loadCampaigns = useCallback(async () => {
    try { setCampaigns(await getCampaigns()) } catch {}
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns, refreshId])

  const handleCreate = async () => {
    if (!newName.trim()) { showToast('Give the campaign a name.', true); return }
    if (newCount <= 0) { showToast('Pick how many leads to pull.', true); return }
    try {
      const camp = await createCampaign({ name: newName.trim(), count: newCount })
      if (camp.leads?.length < newCount) {
        showToast(`Campaign created with ${camp.leads.length} leads.`, true)
      } else {
        showToast(`Campaign "${camp.name}" created with ${camp.leads?.length || 0} leads.`)
      }
      setNewName('')
      refresh()
    } catch { showToast('Failed to create campaign.', true) }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Create a new campaign</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Campaign name</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Cold Call Batch 1"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-emerald-500/40 transition-colors" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">How many leads to pull</label>
            <input type="number" value={newCount} onChange={e => setNewCount(parseInt(e.target.value) || 0)} min="1"
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 transition-colors" />
          </div>
          <div className="flex items-end">
            <button onClick={handleCreate}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
              <PlusCircle size={14} weight="bold" />
              Create campaign
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3">Pulls from verified, active leads that aren't already in another campaign.</p>
      </div>

      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Your campaigns</h2>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ListBullets size={40} className="text-zinc-300 dark:text-zinc-600 mb-4" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No campaigns yet</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Create one above once you have verified leads.</p>
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const verified = c.leads?.filter(l => l.verified).length || 0
            return (
              <motion.div key={c.id} variants={cardVariants} onClick={() => openCampModal(c.id)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50 cursor-pointer hover:border-emerald-500/30 hover:shadow-sm transition-all active:scale-[0.98]">
                <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-sm mb-3">{c.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1"><ListBullets size={12} className="text-zinc-400" />{c.leads?.length || 0} leads</span>
                  <span className="flex items-center gap-1"><CalendarBlank size={12} className="text-zinc-400" />{fmtDate(c.created_at)}</span>
                  <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-500" />{verified} verified</span>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Broadcast Jobs</h2>
      <BroadcastJobs showToast={showToast} />
    </div>
  )
}

export default function Campaigns(props) {
  const [activeTab, setActiveTab] = useState('whatsapp')

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Campaigns</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage your outreach campaigns across all channels.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}>
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {activeTab === 'whatsapp' && <WhatsAppTab {...props} />}
        {activeTab === 'email' && (
          <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <EnvelopeSimple size={40} className="text-zinc-300 dark:text-zinc-600 mb-4" />
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Coming Soon</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Email campaigns are under development.</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
