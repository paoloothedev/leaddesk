import { useState, useEffect } from 'react'
import { PencilSimple, Plus, Phone, WhatsappLogo, EnvelopeSimple, Buildings } from '@phosphor-icons/react'
import { getContact, getCustomFields, getProjectMembers, getPipelines } from '../api'
import { LIFECYCLE } from '../lifecycle'
import { formatDate } from '../format'
import { can } from '../permissions'
import DealModal from './DealModal'
import { BackLink, Panel, FieldRow, CustomFieldRows, ExternalLink, DealList } from './RecordParts'

const btn = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors'

export default function ContactPage({ id, user, stages, refreshId, showToast, goView, openLeadModal }) {
  const [c, setC] = useState(null)
  const [missing, setMissing] = useState(false)
  const [defs, setDefs] = useState([])
  const [members, setMembers] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [dealModal, setDealModal] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    getCustomFields('contact').then(setDefs).catch(() => {})
    getProjectMembers().then(setMembers).catch(() => {})
    getPipelines().then(setPipelines).catch(() => {})
  }, [])
  useEffect(() => {
    getContact(id).then(x => { setC(x); setMissing(false) }).catch(() => setMissing(true))
  }, [id, refreshId, reload])

  if (missing) {
    return (
      <div className="max-w-5xl mx-auto">
        <BackLink onClick={() => goView('leads')}>Contacts</BackLink>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">This contact doesn't exist anymore (it may have been merged or deleted).</p>
      </div>
    )
  }
  if (!c) return null

  const lc = LIFECYCLE[c.lifecycle] || LIFECYCLE.lead
  const owner = members.find(m => m.id === c.owner_id)
  const stage = stages.find(s => s.id === c.stage_id)
  const allStages = pipelines.flatMap(p => p.stages)
  const stageName = (sid) => allStages.find(s => s.id === sid)?.name || ''
  const digits = (c.phone || '').replace(/\D/g, '')

  return (
    <div className="max-w-5xl mx-auto">
      <BackLink onClick={() => goView('leads')}>Contacts</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 break-words">{c.name}</h1>
            <span className={`inline-flex items-center px-2 h-5 rounded text-[10px] font-medium ${lc.cls}`}>{lc.label}</span>
            {c.status === 'dead' && <span className="inline-flex items-center px-2 h-5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Dead</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {c.company && (
              <button onClick={() => goView(`company/${c.company.id}`)} className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400">
                <Buildings size={12} /> {c.company.name}
              </button>
            )}
            <span>Owner: {owner ? (owner.display_name || owner.username) : 'nobody'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {digits && <a href={`tel:+${digits}`} className={btn}><Phone size={13} /> Call</a>}
          {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener" className={btn}><WhatsappLogo size={13} /> WhatsApp</a>}
          {c.email && <a href={`mailto:${c.email}`} className={btn}><EnvelopeSimple size={13} /> Email</a>}
          {can(user, 'leads.edit') && <button onClick={() => openLeadModal(c.id)} className={btn}><PencilSimple size={13} /> Edit</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          <Panel title="Details">
            <dl>
              <FieldRow label="Phone">{c.phone}</FieldRow>
              <FieldRow label="Email">{c.email}</FieldRow>
              <FieldRow label="Outreach stage">{stage?.name}</FieldRow>
              <FieldRow label="Verified">{c.verified ? 'Yes' : 'No'}</FieldRow>
              <FieldRow label="Source">{c.source}</FieldRow>
              <FieldRow label="Created">{formatDate(c.created_at)}</FieldRow>
              {/* Link rows only when set — most contacts have one or two */}
              {c.location && <FieldRow label="Google Maps"><ExternalLink href={c.location}>Open in Maps</ExternalLink></FieldRow>}
              {c.facebook && <FieldRow label="Facebook"><ExternalLink href={c.facebook} /></FieldRow>}
              {c.instagram && <FieldRow label="Instagram"><ExternalLink href={c.instagram} /></FieldRow>}
              {c.tiktok && <FieldRow label="TikTok"><ExternalLink href={c.tiktok} /></FieldRow>}
              {c.link && <FieldRow label="Website"><ExternalLink href={c.link} /></FieldRow>}
              <CustomFieldRows defs={defs} values={c.custom} members={members} />
            </dl>
          </Panel>
          <Panel title="Tags">
            {c.tags?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {c.tags.map(t => <span key={t.id} className="inline-flex items-center px-2 h-6 rounded text-[11px] font-medium text-white" style={{ background: t.color }}>{t.name}</span>)}
              </div>
            ) : <p className="text-xs text-zinc-500 dark:text-zinc-400">No tags.</p>}
          </Panel>
          {c.notes && (
            <Panel title="Notes"><p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{c.notes}</p></Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title={`Deals (${c.deals?.length || 0})`}
            action={can(user, 'deals.edit') && (
              <button onClick={() => setDealModal({ defaults: { contact: { id: c.id, name: c.name }, company: c.company || null } })}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                <Plus size={11} weight="bold" /> New deal
              </button>
            )}>
            <DealList deals={c.deals} stageName={stageName} onOpen={(dealId) => setDealModal({ dealId })} />
          </Panel>
          <Panel title="Campaigns">
            {c.campaigns?.length
              ? <ul className="space-y-1">{c.campaigns.map(x => <li key={x.id} className="text-xs text-zinc-700 dark:text-zinc-300">{x.name}</li>)}</ul>
              : <p className="text-xs text-zinc-500 dark:text-zinc-400">Not in any WhatsApp campaign.</p>}
          </Panel>
          <Panel title="History">
            {/* Phase 2 (E2.1) replaces this with the full activity timeline */}
            {c.stageHistory?.length ? (
              <ol className="space-y-2">
                {c.stageHistory.map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">Outreach stage → {stages.find(s => s.id === h.stage_id)?.name || 'removed stage'}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 ml-auto">{formatDate(h.at)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-zinc-500 dark:text-zinc-400">No history yet.</p>}
          </Panel>
        </div>
      </div>

      {dealModal && (
        <DealModal dealId={dealModal.dealId || null} defaults={dealModal.defaults} pipelines={pipelines} close={() => setDealModal(null)}
          showToast={showToast} onSaved={() => setReload(r => r + 1)} canDelete={can(user, 'deals.delete')} />
      )}
    </div>
  )
}
