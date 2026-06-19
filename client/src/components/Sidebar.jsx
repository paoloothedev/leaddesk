import { motion, AnimatePresence } from 'framer-motion'
import {
  ChartLine, Users, ChatCircle, Skull, Megaphone, GearSix, Upload,
  SidebarSimple, SunDim, MoonStars, DotsThree
} from '@phosphor-icons/react'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: ChartLine },
  { id: 'leads', label: 'All Leads', icon: Users },
  { id: 'chat', label: 'Chat', icon: ChatCircle, badge: true },
  { id: 'dead', label: 'Dead List', icon: Skull },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: GearSix },
  { id: 'import', label: 'Import', icon: Upload },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 120, damping: 20 } }
}

export default function Sidebar({ view, goView, stats, darkMode, toggleDarkMode, sidebarCollapsed, toggleSidebar, mobileMenuOpen, closeMobileMenu, chatUnread }) {
  return (
    <>
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden" onClick={closeMobileMenu} />
      )}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarCollapsed ? 64 : 240,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className={`fixed left-0 top-0 z-50 flex flex-col bg-zinc-900 border-r border-zinc-800 min-h-[100dvh] overflow-hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className={`flex items-center h-14 border-b border-zinc-800 shrink-0 ${sidebarCollapsed ? 'justify-center px-0' : 'px-5'}`}>
          {sidebarCollapsed ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
          ) : (
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
              <span className="font-semibold text-sm text-zinc-100 tracking-tight">LeadDesk</span>
            </div>
          )}
        </div>

        <motion.nav
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto"
        >
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = view === item.id
            return (
              <motion.button
                key={item.id}
                variants={itemVariants}
                onClick={() => { goView(item.id); closeMobileMenu() }}
                whileTap={{ scale: 0.97 }}
                className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors relative ${
                  sidebarCollapsed ? 'justify-center h-10' : 'px-3 h-9 gap-2.5'
                } ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={18} weight={isActive ? 'fill' : 'regular'} className="shrink-0" />
                {!sidebarCollapsed && <span className="truncate text-xs">{item.label}</span>}
                {item.badge && chatUnread > 0 && (
                  <span className={`${sidebarCollapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'} inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white leading-none`}>
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
                {isActive && !sidebarCollapsed && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-emerald-400"
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                  />
                )}
              </motion.button>
            )
          })}
        </motion.nav>

        <div className={`px-2 pb-1 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={toggleSidebar}
            className={`flex items-center rounded-lg transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 ${
              sidebarCollapsed ? 'justify-center w-10 h-10' : 'w-full px-3 h-9 gap-2.5 text-xs font-medium'
            }`}
            title="Toggle sidebar"
          >
            <SidebarSimple size={16} className="shrink-0" />
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
        <div className={`px-2 pb-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={toggleDarkMode}
            className={`flex items-center rounded-lg transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 ${
              sidebarCollapsed ? 'justify-center w-10 h-10' : 'w-full px-3 h-9 gap-2.5 text-xs font-medium'
            }`}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? <SunDim size={16} className="shrink-0" /> : <MoonStars size={16} className="shrink-0" />}
            {!sidebarCollapsed && <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        </div>

        <AnimatePresence>
          {stats && !sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5 py-4 border-t border-zinc-800 space-y-2.5 shrink-0 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Untagged</span>
                <span className="text-[11px] font-medium text-zinc-200">{stats.verifiedNoTags}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">No Campaign</span>
                <span className="text-[11px] font-medium text-zinc-200">{stats.verifiedNoTagsNoCampaign}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  )
}
