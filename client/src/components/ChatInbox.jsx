import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'
import {
  MagnifyingGlass, ArrowLeft, CaretRight, CaretDown,
  Image, Video, Microphone, File, MapPin, User,
  PaperPlaneRight, Check, CheckFat, Spinner, X,
  Envelope, Archive, ChatCircleDots, WhatsappLogo
} from '@phosphor-icons/react'
import { getChats, getChatMessages, sendChatMessage, markChatRead } from '../api'

let mediaCache = {}

async function loadMedia(jid, msgId) {
  const key = jid + ':' + msgId
  if (mediaCache[key]) return mediaCache[key]
  try {
    const res = await fetch('/api/chats/' + encodeURIComponent(jid) + '/media/' + msgId)
    if (!res.ok) return null
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    mediaCache[key] = url
    return url
  } catch { return null }
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return fmtTime(ts)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const mediaTypes = ['image', 'video', 'gif', 'sticker', 'ptv']

function isMediaType(type) { return mediaTypes.includes(type) }

const typeIcon = (type) => {
  const map = {
    image: Image, video: Video, gif: Video, sticker: Image, ptt: Microphone,
    audio: Microphone, document: File, location: MapPin, vcard: User,
    revoked: X, call_log: Envelope, ptv: Video,
  }
  return map[type] || ChatCircleDots
}

function MessageBubble({ m, selectedJid }) {
  const [imgUrl, setImgUrl] = useState(null)
  const [loadingImg, setLoadingImg] = useState(false)

  useEffect(() => {
    if (isMediaType(m.type) && m.hasMedia && !imgUrl && !loadingImg) {
      setLoadingImg(true)
      loadMedia(selectedJid, m.id).then(url => {
        if (url) setImgUrl(url)
        setLoadingImg(false)
      })
    }
  }, [m.id, m.type, m.hasMedia, selectedJid])

  return (
    <div className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-xl overflow-hidden ${
        m.direction === 'out'
          ? 'bg-emerald-500 text-white rounded-br-sm'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm'
      }`}>
        {imgUrl ? (
          <img src={imgUrl} alt="" className="max-w-full max-h-80 object-contain cursor-pointer"
            onClick={() => window.open(imgUrl, '_blank')} loading="lazy" />
        ) : isMediaType(m.type) && m.hasMedia ? (
          loadingImg ? (
            <div className="px-3 py-8 text-center text-xs opacity-60">Loading...</div>
          ) : (
            <div className="px-3 py-8 text-center text-xs opacity-60">
              <div className="text-2xl mb-1 flex justify-center">{React.createElement(typeIcon(m.type), { size: 24 })}</div>
              <span>{m.type}</span>
            </div>
          )
        ) : m.type === 'revoked' ? (
          <div className="px-3 py-2 text-xs italic opacity-60">{m.content}</div>
        ) : null}
        {m.content && !imgUrl && !isMediaType(m.type) && (
          <div className="px-3 py-1.5 text-sm leading-relaxed break-words">{m.content}</div>
        )}
        {imgUrl && m.content && !m.content.startsWith('[') && (
          <div className="px-3 pb-1.5 text-sm leading-relaxed break-words">{m.content}</div>
        )}
        <div className={`flex items-center justify-end gap-1 px-3 pb-1 ${
          m.direction === 'out' ? 'text-emerald-200' : 'text-zinc-400 dark:text-zinc-500'
        }`}>
          <span className="text-[9px]">{fmtTime(m.created_at)}</span>
          {m.direction === 'out' && (
            m.status === 'sending' ? <Spinner size={10} className="animate-spin" /> : <CheckFat size={10} weight="fill" />
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChatInbox({ showToast, initialJid }) {
  const [conversations, setConversations] = useState([])
  const [connected, setConnected] = useState(false)
  const [selectedJid, setSelectedJid] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [leadInfo, setLeadInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mobileView, setMobileView] = useState('list')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [unreadFirst, setUnreadFirst] = useState(false)
  const [visibleCount, setVisibleCount] = useState(30)
  const [showProfile, setShowProfile] = useState(false)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const s = io(window.location.origin)
    socketRef.current = s
    return () => s.disconnect()
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const data = await getChats()
      setConnected(data.connected)
      setConversations(data.conversations || [])
    } catch {
      setConnected(false)
      setConversations([])
    }
  }, [])

  const loadMessages = useCallback(async (jid) => {
    setLoading(true)
    try {
      const data = await getChatMessages(jid)
      setMessages(data.messages || [])
      setLeadInfo(data.lead)
    } catch { setMessages([]) }
    setLoading(false)
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (initialJid) {
      const jid = initialJid.includes('@') ? initialJid : initialJid.replace(/\D/g, '') + '@c.us'
      setSelectedJid(jid)
      setMobileView('chat')
    }
  }, [initialJid])

  useEffect(() => {
    if (selectedJid) {
      loadMessages(selectedJid)
      markChatRead(selectedJid).catch(() => {})
    }
  }, [selectedJid, loadMessages])

  useEffect(() => {
    const s = socketRef.current
    if (!s) return
    const handler = (data) => {
      if (data.jid === selectedJid) {
        setMessages(prev => [...prev, { ...data, direction: 'in', status: 'received', created_at: Date.now() }])
        markChatRead(selectedJid).catch(() => {})
      }
      loadConversations()
    }
    s.on('new_chat_message', handler)
    return () => s.off('new_chat_message', handler)
  }, [selectedJid, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeConversations = useMemo(() => {
    let list = conversations.filter(c => !c.archived)
    if (unreadFirst) {
      list = [...list].sort((a, b) => {
        const aU = a.unread > 0 ? 0 : 1
        const bU = b.unread > 0 ? 0 : 1
        if (aU !== bU) return aU - bU
        return (b.last_at || 0) - (a.last_at || 0)
      })
    }
    return list
  }, [conversations, unreadFirst])

  const archivedConversations = useMemo(() => conversations.filter(c => c.archived), [conversations])

  const filteredActive = useMemo(() => {
    if (!search) return activeConversations.slice(0, visibleCount)
    const q = search.toLowerCase()
    return activeConversations.filter(c =>
      (c.leadName || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    ).slice(0, visibleCount)
  }, [activeConversations, search, visibleCount])

  const filteredArchived = useMemo(() => {
    if (!search) return archivedConversations
    const q = search.toLowerCase()
    return archivedConversations.filter(c =>
      (c.leadName || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    )
  }, [archivedConversations, search])

  const handleSelect = (jid) => {
    setSelectedJid(jid)
    setMobileView('chat')
    setShowProfile(false)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !selectedJid) return
    setInput('')
    setMessages(prev => [...prev, { jid: selectedJid, direction: 'out', content: text, status: 'sending', created_at: Date.now(), leadId: leadInfo?.id || null }])
    try {
      await sendChatMessage(selectedJid, text, leadInfo?.id || null)
      setMessages(prev => prev.map(m => m.content === text && m.direction === 'out' && m.status === 'sending' ? { ...m, status: 'sent' } : m))
      loadConversations()
    } catch {
      setMessages(prev => prev.map(m => m.content === text && m.direction === 'out' && m.status === 'sending' ? { ...m, status: 'failed' } : m))
      showToast?.('Failed to send', true)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread || 0), 0)
  const selectedConv = useMemo(() => conversations.find(c => c.jid === selectedJid) || null, [conversations, selectedJid])

  const renderConversation = (c) => (
    <button
      key={c.jid}
      onClick={() => handleSelect(c.jid)}
      className={`w-full text-left px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
        selectedJid === c.jid ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.leadName}</span>
        <span className="text-[10px] text-zinc-400 shrink-0 ml-2">{c.last_at ? fmtDate(c.last_at) : ''}</span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
          {c.last_type && isMediaType(c.last_type) ? `${c.last_message || c.last_type}` : (c.last_message || '')}
        </span>
        {c.unread > 0 && (
          <span className="shrink-0 ml-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-bold text-white">{c.unread}</span>
        )}
      </div>
    </button>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className={`w-72 md:w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Chats</h2>
            <div className="flex items-center gap-1">
              {unreadTotal > 0 && (
                <button onClick={() => setUnreadFirst(!unreadFirst)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                    unreadFirst
                      ? 'bg-emerald-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}>
                  {unreadTotal} unread
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full h-8 pl-7 pr-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!connected ? (
            <div className="p-4 text-xs text-zinc-400 text-center">
              <div className="mb-2 flex justify-center">
                <WhatsappLogo size={32} className="text-zinc-300 dark:text-zinc-600" />
              </div>
              WhatsApp not connected
              <div className="mt-1 text-[10px]">Go to Settings &rarr; WhatsApp to connect</div>
            </div>
          ) : filteredActive.length === 0 && filteredArchived.length === 0 ? (
            <div className="p-4 text-xs text-zinc-400 text-center">No conversations yet</div>
          ) : (
            <>
              {filteredActive.map(renderConversation)}
              {visibleCount < activeConversations.length && search === '' && (
                <button onClick={() => setVisibleCount(prev => prev + 30)}
                  className="w-full py-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  Load more ({activeConversations.length - visibleCount} remaining)
                </button>
              )}
              {filteredArchived.length > 0 && (
                <>
                  <button onClick={() => setShowArchived(!showArchived)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-t border-zinc-100 dark:border-zinc-800">
                    <Archive size={14} className={showArchived ? 'text-emerald-500' : ''} />
                    Archived ({filteredArchived.length})
                  </button>
                  {showArchived && filteredArchived.map(renderConversation)}
                </>
              )}
            </>
          )}
        </div>

        <div className="md:hidden px-3 py-2 border-t border-zinc-200 dark:border-zinc-800">
          <button onClick={() => { setSelectedJid(null); setMobileView('list') }}
            className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Back to list</button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${mobileView === 'list' ? 'hidden md:flex' : 'flex'} ${showProfile ? 'hidden md:flex' : ''}`}>
        {!selectedJid ? (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
            <div className="text-center">
              <ChatCircleDots size={48} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
              Select a conversation
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <button className="md:hidden text-zinc-500 dark:text-zinc-400" onClick={() => setMobileView('list')}>
                <ArrowLeft size={16} />
              </button>
              <button onClick={() => setShowProfile(!showProfile)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-300 text-sm font-bold shrink-0">
                  {(selectedConv?.leadName || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{selectedConv?.leadName || selectedJid?.split('@')[0] || ''}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{selectedJid?.includes('@g.us') ? 'Group' : (selectedJid?.includes('@broadcast') ? 'Broadcast' : '')} &middot; {!connected ? 'disconnected' : ''}</div>
                </div>
              </button>
              <button onClick={() => setShowProfile(!showProfile)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Contact info">
                <CaretRight size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loading ? (
                <div className="text-xs text-zinc-400 text-center">Loading...</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-zinc-400 text-center">No messages yet. Start a conversation.</div>
              ) : messages.map((m, i) => (
                <MessageBubble key={m.id || i} m={m} selectedJid={selectedJid} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800">
              {!connected && (
                <div className="mb-2 text-[10px] text-amber-600 dark:text-amber-400 text-center">WhatsApp disconnected - messages will send when reconnected</div>
              )}
              <div className="flex items-center gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500" />
                <button onClick={handleSend} disabled={!input.trim()}
                  className="h-9 px-3 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]">
                  <PaperPlaneRight size={16} weight="fill" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showProfile && selectedConv && (
        <div className="w-64 md:w-72 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto shrink-0">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Contact Info</h3>
              <button onClick={() => setShowProfile(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-300 text-2xl font-bold mx-auto mb-2">
              {(selectedConv.leadName || '?')[0].toUpperCase()}
            </div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 break-all">{selectedConv.leadName}</div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 break-all">{selectedJid}</div>
            {leadInfo && (
              <div className="mt-3 text-[11px] text-emerald-600 dark:text-emerald-400">Linked to lead: {leadInfo.name}</div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">About</div>
            <div className="text-xs text-zinc-700 dark:text-zinc-300">
              {selectedJid?.includes('@g.us') ? 'Group chat' : selectedJid?.includes('@broadcast') ? 'Broadcast list' : 'WhatsApp contact'}
              {selectedConv.last_at ? ` · Last activity ${fmtDate(selectedConv.last_at)}` : ''}
            </div>
          </div>
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">Media</div>
            <div className="text-xs text-zinc-500">{messages.filter(m => isMediaType(m.type) && m.hasMedia).length} media files</div>
          </div>
        </div>
      )}
    </div>
  )
}
