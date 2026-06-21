import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import { WhatsappLogo, Plugs, PlugsConnected, SignOut } from '@phosphor-icons/react'

export default function WhatsAppPage({ showToast }) {
  const [socket, setSocket] = useState(null)
  const [waStatus, setWaStatus] = useState('disconnected')
  const [qr, setQR] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const s = io(window.location.origin)
    socketRef.current = s
    setSocket(s)
    s.on('wa_status', (status) => {
      setWaStatus(status.status)
      setQR(status.qr)
    })
    return () => { s.disconnect() }
  }, [])

  const handleInit = async () => { socket?.emit('wa_init') }
  const handleDisconnect = async () => { socket?.emit('wa_disconnect') }
  const handleLogout = async () => {
    if (!window.confirm('Logout and connect a different WhatsApp account?')) return
    socket?.emit('wa_logout')
  }

  const statusConfig = {
    disconnected: { dot: 'bg-zinc-400', label: 'Disconnected', icon: Plugs },
    qr_ready: { dot: 'bg-amber-500', label: 'Scan QR Code', icon: WhatsappLogo },
    connecting: { dot: 'bg-blue-500', label: 'Connecting...', icon: WhatsappLogo },
    connected: { dot: 'bg-emerald-500', label: 'Connected', icon: PlugsConnected },
    error: { dot: 'bg-red-500', label: 'Error', icon: Plugs },
  }

  const config = statusConfig[waStatus] || statusConfig.disconnected
  const StatusIcon = config.icon

  return (
    <div className="max-w-[1400px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/50"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Connection</h2>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-3 h-3 rounded-full ${config.dot}`} />
          <StatusIcon size={18} className="text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm text-zinc-900 dark:text-zinc-100">{config.label}</span>
        </div>

        {waStatus === 'qr_ready' && qr && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 inline-block mb-4"
          >
            <img src={qr} alt="QR Code" className="w-48 h-48" />
          </motion.div>
        )}

        {waStatus !== 'connected' && (
          <button onClick={handleInit}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-[0.98]">
            <PlugsConnected size={14} weight="fill" />
            {waStatus === 'disconnected' ? 'Connect WhatsApp' : 'Retry'}
          </button>
        )}
        {waStatus === 'connected' && (
          <div className="flex items-center gap-2">
            <button onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors active:scale-[0.98]">
              <Plugs size={14} />
              Disconnect
            </button>
            <button onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-medium border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 transition-colors active:scale-[0.98]">
              <SignOut size={14} />
              Logout
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
