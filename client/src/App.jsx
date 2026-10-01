import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import LeadsTable from './components/LeadsTable'
import DeadList from './components/DeadList'
import Campaigns from './components/Campaigns'
import CampaignModal from './components/CampaignModal'
import Settings from './components/Settings'
import Import from './components/Import'
import LeadModal from './components/LeadModal'
import Toast from './components/Toast'
import ClockWidget from './components/ClockWidget'
import Login from './components/Login'
import GoogleMapsScraper from './components/GoogleMapsScraper'
import ProjectPicker from './components/ProjectPicker'
import DealsBoard from './components/DealsBoard'
import { getStats, getStages, getTags, getCampaigns, getSettings, getProjects, setCurrentProjectId } from './api'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

const VIEWS = ['dashboard', 'leads', 'deals', 'scraper', 'campaigns', 'dead', 'settings', 'import']

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data))
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('darkMode', next)
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    setUser(null)
    setCurrentProjectId(null)
  }, [])

  if (!authChecked) return null

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProjectPicker
            user={user}
            onLogout={handleLogout}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
          />
        }
      />
      <Route
        path="/p/:projectId/*"
        element={
          <ProjectShell
            user={user}
            onLogout={handleLogout}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ProjectShell({ user, onLogout, darkMode, toggleDarkMode }) {
  const { projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Set project id SYNCHRONOUSLY during render — before any child effects fire.
  // (Child useEffects run before parent useEffects, so setting it only in an
  // effect causes a race where the first data fetches go out without the header.)
  setCurrentProjectId(projectId)

  const [refreshId, setRefreshId] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stats, setStats] = useState(null)
  const [stages, setStages] = useState([])
  const [tags, setTags] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [editingLeadId, setEditingLeadId] = useState(null)
  const [campModalOpen, setCampModalOpen] = useState(false)
  const [selectedCampId, setSelectedCampId] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [timezone, setTimezone] = useState(() => localStorage.getItem('timezone') || 'UTC')
  const [project, setProject] = useState(null)
  const [projectError, setProjectError] = useState(null)
  const toastTimer = useRef(null)

  // Derive view from path: /p/:projectId/dashboard → 'dashboard'
  const pathParts = location.pathname.split('/')
  const rawView = pathParts[3] || 'dashboard'
  const view = VIEWS.includes(rawView) ? rawView : 'dashboard'

  // Verify project exists (header already set during render above)
  useEffect(() => {
    let cancelled = false
    getProjects()
      .then(list => {
        if (cancelled) return
        const p = list.find(x => x.id === projectId)
        if (!p) {
          setProjectError('Project not found')
          navigate('/', { replace: true })
        } else {
          setProject(p)
          setProjectError(null)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId, navigate])

  const showToast = useCallback((msg, warn = false) => {
    setToastMsg({ msg, warn })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200)
  }, [])

  const refresh = useCallback(() => {
    setRefreshId(r => r + 1)
  }, [])

  // Refresh data when project or view changes
  useEffect(() => {
    refresh()
  }, [projectId, refresh])

  const loadStats = useCallback(async () => {
    try {
      const s = await getStats()
      setStats(s)
    } catch {}
  }, [])

  useEffect(() => { loadStats() }, [loadStats, refreshId])

  const loadStages = useCallback(async () => {
    try {
      const s = await getStages()
      setStages(s)
    } catch {}
  }, [])

  const loadTags = useCallback(async () => {
    try {
      const t = await getTags()
      setTags(t)
    } catch {}
  }, [])

  useEffect(() => { loadStages() }, [loadStages, refreshId])
  useEffect(() => { loadTags() }, [loadTags, refreshId])

  const loadCampaigns = useCallback(async () => {
    try {
      const c = await getCampaigns()
      setCampaigns(c)
    } catch {}
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns, refreshId])

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings()
        if (s.timezone) {
          setTimezone(s.timezone)
          localStorage.setItem('timezone', s.timezone)
        }
      } catch {}
    })()
  }, [refreshId])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebarCollapsed', next)
      return next
    })
  }, [])

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), [])
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  const goView = useCallback((v) => {
    navigate(`/p/${projectId}/${v}`)
    refresh()
  }, [navigate, projectId, refresh])

  const openLeadModal = useCallback((id) => {
    setEditingLeadId(id)
    setLeadModalOpen(true)
  }, [])

  const closeLeadModal = useCallback(() => {
    setLeadModalOpen(false)
    setEditingLeadId(null)
  }, [])

  const openCampModal = useCallback((id) => {
    setSelectedCampId(id)
    setCampModalOpen(true)
  }, [])

  const closeCampModal = useCallback(() => {
    setCampModalOpen(false)
    setSelectedCampId(null)
  }, [])

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard stats={stats} loadStats={loadStats} refreshId={refreshId} goView={goView} openLeadModal={openLeadModal} />
      case 'leads':
        return <LeadsTable user={user} stages={stages} tags={tags} campaigns={campaigns} refreshId={refreshId} openLeadModal={openLeadModal} showToast={showToast} refresh={refresh} goView={goView} />
      case 'deals':
        return <DealsBoard user={user} refreshId={refreshId} showToast={showToast} goView={goView} />
      case 'scraper':
        return <GoogleMapsScraper showToast={showToast} refresh={refresh} />
      case 'dead':
        return <DeadList stages={stages} tags={tags} campaigns={campaigns} refreshId={refreshId} openLeadModal={openLeadModal} showToast={showToast} refresh={refresh} />
      case 'campaigns':
        return <Campaigns refreshId={refreshId} openCampModal={openCampModal} showToast={showToast} refresh={refresh} />
      case 'settings':
        return <Settings user={user} stages={stages} loadStages={loadStages} tags={tags} loadTags={loadTags} refreshId={refreshId} showToast={showToast} refresh={refresh} />
      case 'import':
        return <Import showToast={showToast} refresh={refresh} goView={goView} />
      default:
        return null
    }
  }

  if (projectError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">{projectError}</p>
      </div>
    )
  }

  return (
    <div>
      <Sidebar
        view={view}
        goView={goView}
        showToast={showToast}
        refresh={refresh}
        stats={stats}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        sidebarCollapsed={sidebarCollapsed}
        toggleSidebar={toggleSidebar}
        mobileMenuOpen={mobileMenuOpen}
        closeMobileMenu={closeMobileMenu}
        user={user}
        onLogout={onLogout}
        project={project}
      />
      <Layout sidebarCollapsed={sidebarCollapsed} openMobileMenu={openMobileMenu}>
        <ClockWidget timezone={timezone} />
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </Layout>

      {leadModalOpen && (
        <LeadModal leadId={editingLeadId} stages={stages} tags={tags} close={closeLeadModal} showToast={showToast} refresh={refresh} />
      )}

      {campModalOpen && (
        <CampaignModal campId={selectedCampId} stages={stages} close={closeCampModal} showToast={showToast} refresh={refresh} openLeadModal={openLeadModal} />
      )}

      <Toast msg={toastMsg} />
    </div>
  )
}
