import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Stop, Trash, Broadcast, Clock } from '@phosphor-icons/react'
import { getJobs, pauseJob, resumeJob, stopJob, deleteJob } from '../api'

const STATUS_COLORS = {
  pending: 'text-blue-600 dark:text-blue-500',
  running: 'text-emerald-600 dark:text-emerald-400',
  paused: 'text-amber-600 dark:text-amber-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
  stopped: 'text-red-600 dark:text-red-400',
  failed: 'text-red-600 dark:text-red-400',
}

const STATUS_LABELS = {
  pending: 'Pending', running: 'Running', paused: 'Paused',
  completed: 'Completed', stopped: 'Stopped', failed: 'Failed',
}

function fmtDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BroadcastJobs({ showToast }) {
  const [jobs, setJobs] = useState([])

  const loadJobs = useCallback(async () => {
    try { const data = await getJobs(); setJobs(data) } catch {}
  }, [])

  useEffect(() => {
    loadJobs()
    const id = setInterval(loadJobs, 3000)
    return () => clearInterval(id)
  }, [loadJobs])

  const handlePause = async (id) => {
    try { await pauseJob(id); showToast('Job paused.') }
    catch { showToast('Failed to pause.', true) }
  }

  const handleResume = async (id) => {
    try { await resumeJob(id); showToast('Job resumed.') }
    catch { showToast('Failed to resume.', true) }
  }

  const handleStop = async (id) => {
    if (!confirm('Stop this broadcast?')) return
    try { await stopJob(id); showToast('Job stopped.') }
    catch { showToast('Failed to stop.', true) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job history?')) return
    try { await deleteJob(id); showToast('Job deleted.'); loadJobs() }
    catch { showToast('Failed to delete.', true) }
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Broadcast size={40} className="text-zinc-300 dark:text-zinc-600 mb-4" />
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No broadcast jobs</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Send WhatsApp messages from a campaign to create a job.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Campaign</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Progress</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Sent</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Failed</th>
                  <th className="text-left py-3 px-4 text-zinc-500 dark:text-zinc-400 font-medium text-[11px] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j, i) => {
                  const pct = j.total > 0 ? Math.round((j.sent + j.failed) / j.total * 100) : 0
                  const active = j.status === 'running' || j.status === 'paused' || j.status === 'pending'
                  return (
                    <motion.tr
                      key={j.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(j.created_at)}</td>
                      <td className="py-3 px-4 text-xs font-medium text-zinc-900 dark:text-zinc-100">{j.campaign_id || 'Manual'}</td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold text-xs ${STATUS_COLORS[j.status] || 'text-zinc-500 dark:text-zinc-400'}`}>
                          {STATUS_LABELS[j.status] || j.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full flex-1 max-w-24 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-full bg-emerald-500"
                            />
                          </div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{j.sent}</td>
                      <td className="py-3 px-4 text-xs text-red-600 dark:text-red-400 font-medium tabular-nums">{j.failed}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {j.status === 'running' && (
                            <>
                              <button onClick={() => handlePause(j.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.95]">
                                <Pause size={12} />
                              </button>
                              <button onClick={() => handleStop(j.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.95]">
                                <Stop size={12} weight="fill" />
                              </button>
                            </>
                          )}
                          {j.status === 'paused' && (
                            <>
                              <button onClick={() => handleResume(j.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.95]">
                                <Play size={12} weight="fill" />
                              </button>
                              <button onClick={() => handleStop(j.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.95]">
                                <Stop size={12} weight="fill" />
                              </button>
                            </>
                          )}
                          {j.status === 'pending' && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 px-1.5 h-7">
                              <Clock size={12} className="animate-pulse" />
                              Queued
                            </span>
                          )}
                          {!active && (
                            <button onClick={() => handleDelete(j.id)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors active:scale-[0.95]">
                              <Trash size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
