import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash, PencilSimple, Tag as TagIcon, Check, X } from '@phosphor-icons/react'
import { createTag, updateTag, deleteTag } from '../api'

export default function Tags({ tags, loadTags, showToast, refreshId, refresh }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3d5a45')
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editShow, setEditShow] = useState(true)

  useEffect(() => { loadTags() }, [loadTags, refreshId])

  const handleCreate = async () => {
    if (!newName.trim()) { showToast('Enter a tag name.', true); return }
    try {
      await createTag({ name: newName.trim(), color: newColor })
      setNewName('')
      showToast('Tag created.')
      refresh()
    } catch { showToast('Failed to create tag.', true) }
  }

  const handleUpdate = async (id) => {
    try {
      await updateTag(id, { name: editName, color: editColor, show_in_dashboard: editShow })
      setEditing(null)
      refresh()
    } catch { showToast('Failed to update.', true) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this tag? It will be removed from all leads.')) return
    try { await deleteTag(id); showToast('Tag deleted.'); refresh() }
    catch { showToast('Failed to delete.', true) }
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">Tags</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Create and manage tags for categorizing leads.</p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50 mb-6"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Create a new tag</h2>
        <div className="flex items-center gap-3">
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent" />
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tag name"
            className="flex-1 h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors" />
          <button onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98] whitespace-nowrap">
            <Plus size={14} weight="bold" />
            Create tag
          </button>
        </div>
      </motion.div>

      {tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <TagIcon size={40} className="text-zinc-300 dark:text-zinc-600 mb-4" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No tags yet</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Create tags above to organize your leads.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left py-3 px-5 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-5 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Color</th>
                <th className="text-left py-3 px-5 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Leads</th>
                <th className="text-left py-3 px-5 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Dashboard</th>
                <th className="text-left py-3 px-5 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map(t => (
                <tr key={t.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  {editing === t.id ? (
                    <>
                      <td className="py-3 px-5">
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          className="h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500/40 w-40" />
                      </td>
                      <td className="py-3 px-5">
                        <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                      </td>
                      <td className="py-3 px-5 text-xs text-zinc-500 dark:text-zinc-400">{t.lead_count || 0}</td>
                      <td className="py-3 px-5">
                        <input type="checkbox" checked={editShow} onChange={e => setEditShow(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(t.id)}
                            className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
                            <Check size={12} weight="bold" />
                            Save
                          </button>
                          <button onClick={() => setEditing(null)}
                            className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                            <X size={12} />
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-5">
                        <span className="inline-block px-2.5 py-1 rounded text-[11px] font-bold text-white" style={{ background: t.color }}>{t.name}</span>
                      </td>
                      <td className="py-3 px-5 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">{t.color}</td>
                      <td className="py-3 px-5 text-xs text-zinc-500 dark:text-zinc-400">{t.lead_count || 0}</td>
                      <td className="py-3 px-5">
                        {t.show_in_dashboard
                          ? <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">On</span>
                          : <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">Off</span>}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(t.id); setEditName(t.name); setEditColor(t.color); setEditShow(!!t.show_in_dashboard) }}
                            className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                            <PencilSimple size={12} />
                            Edit
                          </button>
                          <button onClick={() => handleDelete(t.id)}
                            className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.98]">
                            <Trash size={12} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
