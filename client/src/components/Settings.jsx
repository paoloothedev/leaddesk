import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  DownloadSimple, UploadSimple, FileCsv, ClipboardText,
  Tag, WhatsappLogo, ChatText, Signpost, Broadcast, GearSix
} from '@phosphor-icons/react'
import { exportBackup, importBackup, exportCSV, getSettings, saveSetting } from '../api'
import TagsView from './Tags'
import WhatsAppPage from './WhatsAppPage'
import MessageTemplates from './MessageTemplates'
import Stages from './Stages'
import BroadcastJobs from './BroadcastJobs'

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Europe/Istanbul',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
]

const TABS = [
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo },
  { id: 'templates', label: 'Message Templates', icon: ChatText },
  { id: 'stages', label: 'Stages', icon: Signpost },
  { id: 'jobs', label: 'Broadcast Jobs', icon: Broadcast },
  { id: 'general', label: 'General', icon: GearSix },
  { id: 'backup', label: 'Backup', icon: ClipboardText },
]

export default function Settings(props) {
  const [activeTab, setActiveTab] = useState('tags')
  const [countryCode, setCountryCode] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const jsonInputRef = useRef(null)
  const { showToast, refresh } = props

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings()
        if (s.country_code) setCountryCode(s.country_code)
        if (s.timezone) setTimezone(s.timezone)
      } catch {}
    })()
  }, [])

  const handleSaveCountryCode = async () => {
    try {
      await saveSetting('country_code', countryCode.replace(/\D/g, ''))
      showToast('Country code saved.')
    } catch { showToast('Failed to save.', true) }
  }

  const handleExport = async () => {
    try {
      const data = await exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leaddesk-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Backup file downloaded.')
    } catch { showToast('Export failed.', true) }
  }

  const handleImportJSON = () => { jsonInputRef.current?.click() }

  const handleJSONFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.leads) { showToast('Invalid backup file.', true); return }
      if (!confirm('This will replace ALL current data with the backup. Continue?')) return
      await importBackup(data)
      showToast('Backup restored successfully.')
      refresh()
    } catch { showToast('Could not read that file.', true) }
    e.target.value = ''
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage tags, WhatsApp connection, and pipeline stages.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
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
        {activeTab === 'tags' && <TagsView {...props} />}
        {activeTab === 'whatsapp' && (
          <div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50 mb-5">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Phone Format</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed max-w-[65ch]">
                Set your country code so imported phone numbers are formatted correctly for WhatsApp.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-900 dark:text-zinc-100 font-medium">+</span>
                <input type="text" value={countryCode} onChange={e => setCountryCode(e.target.value.replace(/\D/g, ''))}
                  className="w-24 h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors"
                  placeholder="e.g. 20" />
                <button onClick={handleSaveCountryCode}
                  className="inline-flex items-center px-4 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
                  Save
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3">
                Example: 010 9423 4694 {countryCode ? `becomes +${countryCode} 109 423 4694` : 'will be formatted with your code'} during import.
              </p>
            </div>
            <WhatsAppPage {...props} />
          </div>
        )}
        {activeTab === 'templates' && <MessageTemplates {...props} />}
        {activeTab === 'stages' && <Stages {...props} />}
        {activeTab === 'jobs' && <BroadcastJobs {...props} />}
        {activeTab === 'general' && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Timezone</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed max-w-[65ch]">
              Set the timezone used for the clock widget and any time-based features.
            </p>
            <div className="flex items-center gap-3">
              <select value={timezone} onChange={e => setTimezone(e.target.value)}
                className="h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors">
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
              </select>
              <button onClick={async () => {
                try {
                  await saveSetting('timezone', timezone)
                  showToast('Timezone saved.')
                } catch { showToast('Failed to save.', true) }
              }}
                className="inline-flex items-center px-4 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
                Save
              </button>
            </div>
          </div>
        )}
        {activeTab === 'backup' && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Backup & Export</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed max-w-[65ch]">Export your data as JSON or CSV, or restore a previous backup.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                <DownloadSimple size={14} />
                Export JSON
              </button>
              <button onClick={exportCSV}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                <FileCsv size={14} />
                Export CSV
              </button>
              <button onClick={handleImportJSON}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                <UploadSimple size={14} />
                Import JSON
              </button>
            </div>
            <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJSONFile} />
          </div>
        )}
      </motion.div>
    </div>
  )
}
