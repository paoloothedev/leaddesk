import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { MagnifyingGlass, Trash, Check, ArrowClockwise, DownloadSimple, MapPin, CaretDown, CaretUp, FileCsv } from '@phosphor-icons/react'
import { scrapeGmaps, getGmapsJobs, getGmapsJob, deleteGmapsJob, importGmapsJob, downloadGmapsCSV } from '../api'

const PRESET_LOCATIONS = [
  { name: 'United Kingdom', geo: '51.5074,-0.1278', zoom: 6, lang: 'en' },
  { name: 'London, UK', geo: '51.5074,-0.1278', zoom: 12, lang: 'en' },
  { name: 'Manchester, UK', geo: '53.4808,-2.2426', zoom: 12, lang: 'en' },
  { name: 'Birmingham, UK', geo: '52.4862,-1.8904', zoom: 12, lang: 'en' },
  { name: 'New York, USA', geo: '40.7128,-74.0060', zoom: 12, lang: 'en' },
  { name: 'Berlin, Germany', geo: '52.5200,13.4050', zoom: 12, lang: 'de' },
  { name: 'Paris, France', geo: '48.8566,2.3522', zoom: 12, lang: 'fr' },
  { name: 'Dubai, UAE', geo: '25.2048,55.2708', zoom: 12, lang: 'en' },
  { name: 'Cairo, Egypt', geo: '30.0444,31.2357', zoom: 12, lang: 'ar' },
  { name: 'Alexandria, Egypt', geo: '31.2001,29.9187', zoom: 12, lang: 'ar' },
  { name: 'Istanbul, Turkey', geo: '41.0082,28.9784', zoom: 12, lang: 'tr' },
  { name: 'Riyadh, Saudi Arabia', geo: '24.7136,46.6753', zoom: 12, lang: 'ar' },
  { name: 'Jeddah, Saudi Arabia', geo: '21.4858,39.1925', zoom: 12, lang: 'ar' },
  { name: 'Toronto, Canada', geo: '43.6532,-79.3832', zoom: 12, lang: 'en' },
  { name: 'Sydney, Australia', geo: '-33.8688,151.2093', zoom: 12, lang: 'en' },
  { name: 'No Location (Auto)', geo: '', zoom: 0, lang: 'en' },
]

export default function GoogleMapsScraper({ showToast, refresh }) {
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState(5)
  const [lang, setLang] = useState('en')
  const [geo, setGeo] = useState('')
  const [zoom, setZoom] = useState(12)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [jobDetail, setJobDetail] = useState(null)
  const [selectedResults, setSelectedResults] = useState(new Set())
  const [importing, setImporting] = useState(false)

  const loadJobs = useCallback(async () => {
    try {
      const data = await getGmapsJobs()
      setJobs(data)
    } catch {}
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  useEffect(() => {
    if (!selectedJob) return
    const interval = setInterval(async () => {
      try {
        const detail = await getGmapsJob(selectedJob)
        setJobDetail(detail)
        if (detail.status === 'completed' || detail.status === 'failed') {
          clearInterval(interval)
          loadJobs()
        }
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [selectedJob, loadJobs])

  const handlePresetLocation = (preset) => {
    setGeo(preset.geo)
    setZoom(preset.zoom)
    setLang(preset.lang)
  }

  const handleScrape = async () => {
    if (!query.trim()) { showToast('Enter a search query.', true); return }
    setScraping(true)
    try {
      const opts = { depth, lang }
      if (geo) {
        opts.geo = geo
        opts.zoom = zoom
      }
      const res = await scrapeGmaps(query, opts)
      setSelectedJob(res.job_id)
      const locLabel = geo ? ` near ${geo} (zoom ${zoom})` : ''
      setJobDetail({ id: res.job_id, status: 'pending', query: query + locLabel })
      showToast('Scrape job started.')
      loadJobs()
    } catch (err) {
      showToast(err.message || 'Failed to start scrape.', true)
    }
    setScraping(false)
  }

  const handleDelete = async (id) => {
    try {
      await deleteGmapsJob(id)
      if (selectedJob === id) { setSelectedJob(null); setJobDetail(null) }
      showToast('Job deleted.')
      loadJobs()
    } catch (err) {
      showToast(err.message || 'Failed to delete.', true)
    }
  }

  const handleImport = async () => {
    if (!jobDetail || !jobDetail.results?.length) return
    setImporting(true)
    try {
      const indices = selectedResults.size > 0 ? [...selectedResults] : undefined
      const res = await importGmapsJob(selectedJob, { skipDupes: true, selectedIndices: indices })
      showToast(`Imported ${res.added} leads (${res.skipped} skipped).`)
      if (refresh) refresh()
      setSelectedResults(new Set())
    } catch (err) {
      showToast(err.message || 'Failed to import.', true)
    }
    setImporting(false)
  }

  const toggleResult = (idx) => {
    const next = new Set(selectedResults)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelectedResults(next)
  }

  const toggleAllResults = () => {
    if (!jobDetail?.results) return
    if (selectedResults.size === jobDetail.results.length) {
      setSelectedResults(new Set())
    } else {
      setSelectedResults(new Set(jobDetail.results.map((_, i) => i)))
    }
  }

  const results = jobDetail?.results || []

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">Google Maps Scraper</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Search Google Maps by location and import businesses as leads.</p>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50 mb-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Search</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              placeholder="e.g. restaurants, dentists, gyms, hotels..."
              className="flex-1 h-10 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors" />
            <button onClick={handleScrape} disabled={scraping}
              className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98] disabled:opacity-50 shrink-0">
              {scraping ? <ArrowClockwise size={14} className="animate-spin" /> : <MagnifyingGlass size={14} weight="bold" />}
              {scraping ? 'Starting...' : 'Scrape'}
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <label className="flex items-center gap-1.5">
              Depth:
              <input type="range" min="1" max="10" value={depth} onChange={e => setDepth(parseInt(e.target.value))}
                className="w-20 accent-emerald-500" />
              <span className="font-mono text-zinc-700 dark:text-zinc-300 w-4">{depth}</span>
            </label>
            <label className="flex items-center gap-1.5">
              Language:
              <select value={lang} onChange={e => setLang(e.target.value)}
                className="h-7 px-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none">
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="ar">Arabic</option>
                <option value="pt">Portuguese</option>
                <option value="tr">Turkish</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
              </select>
            </label>
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
              <MapPin size={11} />
              Location
              {showAdvanced ? <CaretUp size={10} /> : <CaretDown size={10} />}
            </button>
            {geo && (
              <span className="inline-flex items-center gap-1 px-2 h-6 rounded bg-emerald-50 dark:bg-emerald-900/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <MapPin size={10} />
                {geo} zoom:{zoom}
              </span>
            )}
          </div>

          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-900 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {PRESET_LOCATIONS.map(p => (
                  <button key={p.name} onClick={() => handlePresetLocation(p)}
                    className={`px-2.5 h-7 rounded-lg text-[11px] font-medium transition-all ${
                      geo === p.geo
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'
                    }`}>
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Coordinates (lat,lon)</label>
                  <input type="text" value={geo} onChange={e => setGeo(e.target.value)}
                    placeholder="51.5074,-0.1278"
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-mono placeholder-zinc-400 outline-none focus:ring-1 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Zoom Level</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="1" max="21" value={zoom} onChange={e => setZoom(parseInt(e.target.value))}
                      className="flex-1 accent-emerald-500" />
                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 w-6 text-right">{zoom}</span>
                  </div>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5">1=world, 6=country, 12=city, 15=street</p>
                </div>
                <div className="flex items-end">
                  {geo ? (
                    <button onClick={() => { setGeo(''); setZoom(12) }}
                      className="h-8 px-3 rounded-lg text-[11px] font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors">
                      Clear Location
                    </button>
                  ) : (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">No location set — will search Google Maps globally. Set coordinates to target a specific area.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {selectedJob && jobDetail && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {jobDetail.query || 'Scrape Results'}
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                {jobDetail.status === 'pending' && 'Queued...'}
                {jobDetail.status === 'running' && (jobDetail.progress?.message || 'Scraping...')}
                {jobDetail.status === 'completed' && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{jobDetail.result_count} records found</span>
                )}
                {jobDetail.status === 'failed' && <span className="text-red-500">Failed: {jobDetail.error}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {jobDetail.status === 'completed' && jobDetail.result_count > 0 && (
                <>
                  <button onClick={() => downloadGmapsCSV(selectedJob, jobDetail.query)}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors active:scale-[0.98]">
                    <FileCsv size={12} />
                    Download CSV
                  </button>
                  <button onClick={handleImport} disabled={importing}
                    className="inline-flex items-center gap-1.5 px-4 h-8 rounded-lg text-[11px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98] disabled:opacity-50">
                    <DownloadSimple size={12} />
                    {importing ? 'Importing...' : `Import${selectedResults.size > 0 ? ` (${selectedResults.size})` : ' All'}`}
                  </button>
                </>
              )}
              <button onClick={() => { setSelectedJob(null); setJobDetail(null) }}
                className="inline-flex items-center px-3 h-8 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                Close
              </button>
            </div>
          </div>

          {(jobDetail.status === 'pending' || jobDetail.status === 'running') && (
            <div className="p-8 flex flex-col items-center justify-center">
              <ArrowClockwise size={32} className="text-emerald-500 animate-spin mb-3" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{jobDetail.progress?.message || 'Starting...'}</p>
            </div>
          )}

          {jobDetail.status === 'completed' && results.length > 0 && (
            <div className="overflow-x-auto">
              <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <button onClick={toggleAllResults}
                  className="inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <Check size={10} />
                  {selectedResults.size === results.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{selectedResults.size} selected</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="w-10 py-2.5 px-3"></th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Name</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Category</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Phone</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Website</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Rating</th>
                    <th className="text-left py-2.5 px-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => toggleResult(i)}>
                      <td className="py-2.5 px-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedResults.has(i) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600'
                        }`}>
                          {selectedResults.has(i) && <Check size={10} className="text-white" weight="bold" />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{r.title || r.name || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {r.category && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{r.category}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-600 dark:text-zinc-400 font-mono">{r.phone || '-'}</td>
                      <td className="py-2.5 px-3 text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">{r.website || r.web_site || '-'}</td>
                      <td className="py-2.5 px-3">
                        {r.review_rating > 0 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                            {r.review_rating.toFixed(1)} ({r.review_count})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[250px]">{r.address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Scrape Jobs</h2>
          <button onClick={loadJobs}
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
            <ArrowClockwise size={11} /> Refresh
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="p-8 text-center">
            <MagnifyingGlass size={32} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-xs text-zinc-400 dark:text-zinc-500">No scrape jobs yet. Search above to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {jobs.map(job => (
              <div key={job.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer ${
                selectedJob === job.id ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''
              }`} onClick={() => { setSelectedJob(job.id); setJobDetail(null) }}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  job.status === 'completed' ? 'bg-emerald-500' :
                  job.status === 'running' ? 'bg-amber-500 animate-pulse' :
                  job.status === 'failed' ? 'bg-red-500' : 'bg-zinc-300 dark:bg-zinc-600'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate block">{job.query}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {job.status}
                    {job.result_count > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium"> · {job.result_count} records</span>}
                    {job.status === 'failed' && job.error && <span className="text-red-500"> · {job.error}</span>}
                  </span>
                </div>
                {job.status === 'completed' && job.result_count > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); downloadGmapsCSV(job.id, job.query) }}
                    className="p-1.5 rounded text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors shrink-0" title="Download CSV">
                    <FileCsv size={14} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); handleDelete(job.id) }}
                  className="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
