import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { io } from 'socket.io-client'
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
import Home from './components/Home'
import ClientsList from './components/ClientsList'
import GoogleMapsScraper from './components/GoogleMapsScraper'
import { getStats, getStages, getTags, getCampaigns, getSettings } from './api'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

const VIEWS = ['home', 'dashboard', 'leads', 'clients', 'scraper', 'campaigns', 'dead', 'settings', 'import']

export default function App() {
  const [view, setView] = useState('home')
  const [refreshId, setRefreshId] = useState(0)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
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
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const toastTimer = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const s = io(window.location.origin)
    socketRef.current = s
    return () => s.disconnect()
  }, [])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data) })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  const showToast = useCallback((msg, warn = false) => {
    setToastMsg({ msg, warn })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200)
  }, [])

  const refresh = useCallback(() => {
    setRefreshId(r => r + 1)
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const s = await getStats()
      setStats(s)
    } catch {}
  }, [])

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

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('darkMode', next)
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebarCollapsed', next)
      return next
    })
  }, [])

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), [])
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

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

  const goView = useCallback((v) => {
    setView(v)
    refresh()
  }, [refresh])

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

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    setUser(null)
  }, [])

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home goView={goView} />
      case 'dashboard':
        return <Dashboard stats={stats} loadStats={loadStats} refreshId={refreshId} goView={goView} openLeadModal={openLeadModal} />
      case 'leads':
        return <LeadsTable stages={stages} tags={tags} campaigns={campaigns} refreshId={refreshId} openLeadModal={openLeadModal} showToast={showToast} refresh={refresh} goView={goView} />
      case 'clients':
        return <ClientsList tags={tags} refreshId={refreshId} showToast={showToast} refresh={refresh} />
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

  if (!authChecked) return null

  if (!user) {
    return <Login onLogin={setUser} />
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
        onLogout={handleLogout}
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
