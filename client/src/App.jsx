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
import ChatInbox from './components/ChatInbox'
import Toast from './components/Toast'
import { getStats, getStages, getTags, getCampaigns } from './api'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

const VIEWS = ['dashboard', 'leads', 'dead', 'chat', 'campaigns', 'settings', 'import']

export default function App() {
  const [view, setView] = useState('dashboard')
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
  const [chatUnread, setChatUnread] = useState(0)
  const [chatLeadPhone, setChatLeadPhone] = useState(null)
  const toastTimer = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const s = io(window.location.origin)
    socketRef.current = s
    s.on('new_chat_message', () => {
      if (view !== 'chat') {
        setChatUnread(prev => prev + 1)
      }
    })
    return () => s.disconnect()
  }, [view])

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

  const goView = useCallback((v) => {
    setView(v)
    if (v === 'chat') setChatUnread(0)
    refresh()
  }, [refresh])

  const openChatWithLead = useCallback((phone, name) => {
    setChatLeadPhone(phone)
    setView('chat')
    setChatUnread(0)
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

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard stats={stats} loadStats={loadStats} refreshId={refreshId} goView={goView} openLeadModal={openLeadModal} />
      case 'leads':
        return <LeadsTable stages={stages} tags={tags} campaigns={campaigns} refreshId={refreshId} openLeadModal={openLeadModal} showToast={showToast} refresh={refresh} goView={goView} openChatWithLead={openChatWithLead} />
      case 'dead':
        return <DeadList stages={stages} tags={tags} campaigns={campaigns} refreshId={refreshId} openLeadModal={openLeadModal} showToast={showToast} refresh={refresh} />
      case 'chat':
        return <ChatInbox showToast={showToast} initialJid={chatLeadPhone} />
      case 'campaigns':
        return <Campaigns refreshId={refreshId} openCampModal={openCampModal} showToast={showToast} refresh={refresh} />
      case 'settings':
        return <Settings stages={stages} loadStages={loadStages} tags={tags} loadTags={loadTags} refreshId={refreshId} showToast={showToast} refresh={refresh} />
      case 'import':
        return <Import showToast={showToast} refresh={refresh} goView={goView} />
      default:
        return null
    }
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
        chatUnread={chatUnread}
      />
      <Layout sidebarCollapsed={sidebarCollapsed} openMobileMenu={openMobileMenu}>
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
