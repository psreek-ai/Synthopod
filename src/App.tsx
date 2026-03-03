import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Mic, Sparkles, Loader2, Headphones, Plus, 
  MessageSquare, Trash2, Settings, MoreVertical, 
  Copy, Check, RotateCcw, Menu, X, History,
  MicOff, Volume2, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, MessageRole, PodcastData, ChatSession } from './types';
import { ChatMessageComponent } from './components/ChatMessage';
import { generatePodcastScript, generatePodcastAudio } from './services/gemini';

const SUGGESTED_PROMPTS = [
  { title: "Tech Trends", prompt: "A 2-minute podcast about the latest in AI and robotics." },
  { title: "Daily Calm", prompt: "A soothing 1-minute meditation podcast with nature sounds." },
  { title: "True Crime", prompt: "A suspenseful intro to a fictional true crime mystery." },
  { title: "Space News", prompt: "An exciting update about the latest Mars rover discovery." }
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('synthopod_sessions');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse sessions from localStorage', e);
    }
    return [];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearAll = () => {
    setSessions([]);
    setCurrentSessionId(null);
    setIsClearing(false);
  };
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    try {
      if (isListening) {
        recognitionRef.current?.stop();
      } else {
        recognitionRef.current?.start();
        setIsListening(true);
      }
    } catch (e) {
      console.error('Speech recognition error', e);
      setIsListening(false);
    }
  };

  const startEditing = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const saveTitle = () => {
    if (editingSessionId && editingTitle.trim()) {
      setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, title: editingTitle } : s));
    }
    setEditingSessionId(null);
  };

  const handleShare = async () => {
    if (!currentSession) {
      alert('Please select or create a podcast session first.');
      return;
    }

    // Find the last podcast in the session
    const lastPodcastMsg = [...messages].reverse().find(m => m.podcast);
    
    let shareUrl = window.location.origin + window.location.pathname;
    
    if (lastPodcastMsg?.podcast) {
      // Encode the title and script for sharing
      // We use encodeURIComponent and btoa for a simple shared link
      // Note: Audio is too large for URL, so recipient will regenerate it
      const shareData = {
        title: lastPodcastMsg.podcast.title,
        script: lastPodcastMsg.podcast.script,
        prompt: messages.find(m => m.role === MessageRole.USER)?.content || ''
      };
      
      try {
        const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
        shareUrl += `?p=${encoded}`;
      } catch (e) {
        console.error('Failed to encode share data', e);
      }
    }

    const sharePayload = {
      title: 'SynthoPod',
      text: currentSession.title ? `Check out this podcast: ${currentSession.title}` : 'Check out this AI-generated podcast!',
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Shareable link copied to clipboard!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  // Handle shared links on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedPodcast = params.get('p');
    
    if (sharedPodcast) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(sharedPodcast)));
        if (decoded.title && decoded.script) {
          // Clear URL params without refreshing
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Create a special session for the shared podcast
          const importShared = async () => {
            setIsLoading(true);
            setStatus('Importing shared podcast...');
            
            try {
              const audioBase64 = await generatePodcastAudio(decoded.script);
              
              const newSession: ChatSession = {
                id: 'shared_' + Date.now(),
                title: `Shared: ${decoded.title}`,
                messages: [
                  {
                    id: '1',
                    role: MessageRole.ASSISTANT,
                    content: `Someone shared this podcast with you: **${decoded.title}**. I've regenerated the audio for you to listen.`,
                    podcast: {
                      id: Date.now().toString(),
                      title: decoded.title,
                      script: decoded.script,
                      audioBase64
                    },
                    timestamp: Date.now()
                  }
                ],
                lastUpdated: Date.now()
              };
              
              setSessions(prev => [newSession, ...prev]);
              setCurrentSessionId(newSession.id);
            } catch (err) {
              console.error('Failed to import shared podcast', err);
            } finally {
              setIsLoading(false);
              setStatus(null);
            }
          };
          
          importShared();
        }
      } catch (e) {
        console.error('Failed to decode shared podcast', e);
      }
    }
  }, []);

  // Handle mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Save sessions to localStorage (stripped of heavy audio data)
  useEffect(() => {
    try {
      const strippedSessions = sessions.map(session => ({
        ...session,
        messages: session.messages.map(msg => {
          if (msg.podcast) {
            const { audioBase64, ...rest } = msg.podcast;
            return { ...msg, podcast: rest };
          }
          return msg;
        })
      }));
      localStorage.setItem('synthopod_sessions', JSON.stringify(strippedSessions));
    } catch (e) {
      console.error('Failed to save sessions to localStorage', e);
    }
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const createNewSession = (initialPrompt?: string) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: initialPrompt ? (initialPrompt.length > 20 ? initialPrompt.substring(0, 20) + '...' : initialPrompt) : 'New Podcast',
      messages: [
        {
          id: '1',
          role: MessageRole.ASSISTANT,
          content: "Welcome to **SynthoPod**. I'm your AI podcast producer. Tell me what you'd like to hear about today, or give me a topic and I'll craft a custom podcast for you.",
          timestamp: Date.now(),
        }
      ],
      lastUpdated: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    if (isMobile) setIsSidebarOpen(false);
    return newSession.id;
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = createNewSession(textToSend);
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      content: textToSend,
      timestamp: Date.now(),
    };

    // Update session with user message
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          messages: [...s.messages, userMessage],
          lastUpdated: Date.now(),
          title: s.messages.length === 1 ? (textToSend.length > 20 ? textToSend.substring(0, 20) + '...' : textToSend) : s.title
        };
      }
      return s;
    }));

    setInput('');
    setIsLoading(true);
    setStatus('Generating script...');

    try {
      const currentMessages = sessions.find(s => s.id === sessionId)?.messages || [];
      const { title, script } = await generatePodcastScript(textToSend, currentMessages, setStatus);
      
      setStatus('Synthesizing audio...');
      const audioBase64 = await generatePodcastAudio(script);

      const podcast: PodcastData = {
        id: Date.now().toString(),
        title,
        script,
        audioBase64,
      };

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.ASSISTANT,
        content: `I've produced a new podcast for you: **${title}**. You can listen to it below.`,
        podcast,
        timestamp: Date.now(),
      };

      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: [...s.messages, assistantMessage],
            lastUpdated: Date.now()
          };
        }
        return s;
      }));
    } catch (error) {
      console.error('Error generating podcast:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.ASSISTANT,
        content: "I'm sorry, I encountered an error while trying to produce your podcast. Please try again with a different prompt.",
        timestamp: Date.now(),
      };
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: [...s.messages, errorMessage],
            lastUpdated: Date.now()
          };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
  };

  const handleRegenerateAudio = async (messageId: string, script: string) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setStatus('Regenerating audio...');
    
    try {
      const audioBase64 = await generatePodcastAudio(script);
      
      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: session.messages.map(msg => {
              if (msg.id === messageId && msg.podcast) {
                return {
                  ...msg,
                  podcast: { ...msg.podcast, audioBase64 }
                };
              }
              return msg;
            })
          };
        }
        return session;
      }));
    } catch (error) {
      console.error('Error regenerating audio:', error);
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
  };

  return (
    <div className="relative h-screen w-full flex bg-[#0a0502] overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 atmosphere pointer-events-none z-0" />
      
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className={`fixed md:relative z-40 w-[280px] h-full bg-black/40 backdrop-blur-2xl border-r border-white/5 flex flex-col`}
          >
            <div className="p-4 flex items-center justify-between">
              <button 
                onClick={() => createNewSession()}
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium text-white group"
              >
                <Plus size={18} className="text-[#ff4e00] group-hover:scale-110 transition-transform" />
                New Podcast
              </button>
              {isMobile && (
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="ml-2 p-3 text-white/40 hover:text-white md:hidden"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
              <div className="px-3 mb-2 flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Recent Sessions</span>
                {sessions.length > 0 && (
                  <div className="flex items-center gap-2">
                    {isClearing ? (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleClearAll}
                          className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors uppercase tracking-widest"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={() => setIsClearing(false)}
                          className="text-[10px] font-mono text-white/20 hover:text-white transition-colors uppercase tracking-widest"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsClearing(true)}
                        className="text-[10px] font-mono text-white/20 hover:text-red-400 transition-colors uppercase tracking-widest"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {sessions.map(session => (
                  <div 
                    key={session.id}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      if (isMobile) setIsSidebarOpen(false);
                    }}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                      currentSessionId === session.id 
                        ? 'bg-[#ff4e00]/10 text-white border border-[#ff4e00]/20' 
                        : 'text-white/40 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <MessageSquare size={16} className={currentSessionId === session.id ? 'text-[#ff4e00]' : ''} />
                    {editingSessionId === session.id ? (
                      <input 
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                        className="bg-transparent border-none outline-none text-sm text-white w-full"
                      />
                    ) : (
                      <span className="text-sm truncate flex-1">{session.title}</span>
                    )}
                    <div className={`flex items-center gap-1 transition-all ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button 
                        onClick={(e) => startEditing(session, e)}
                        className="p-1 hover:text-[#ff4e00]"
                      >
                        <Settings size={14} />
                      </button>
                      <button 
                        onClick={(e) => deleteSession(session.id, e)}
                        className="p-1 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-white/5">
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-all text-sm">
                <Settings size={18} />
                Settings
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              {isSidebarOpen ? <X size={20} className="hidden md:block" /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#ff4e00] flex items-center justify-center">
                <Headphones size={18} className="text-white" />
              </div>
              <h1 className="text-lg font-serif italic tracking-tight text-white hidden sm:block">SynthoPod</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {currentSessionId && (
              <button 
                onClick={(e) => deleteSession(currentSessionId, e)}
                className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                title="Delete Session"
              >
                <Trash2 size={20} />
              </button>
            )}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest">Live Engine</span>
            </div>
            <button 
              onClick={handleShare}
              className="p-2 text-white/40 hover:text-white transition-colors"
            >
              <Share2 size={18} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <main 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar px-4 py-8 w-full max-w-4xl mx-auto"
        >
          {!currentSessionId ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8"
              >
                <div className="w-20 h-20 rounded-3xl bg-[#ff4e00] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-[#ff4e00]/20">
                  <Sparkles size={40} className="text-white" />
                </div>
                <h2 className="text-3xl font-serif italic text-white mb-2">What shall we produce today?</h2>
                <p className="text-white/40 text-sm max-w-md mx-auto">
                  Describe a topic, a story, or a news event, and I'll generate a custom podcast script and audio for you.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {SUGGESTED_PROMPTS.map((item, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => handleSend(item.prompt)}
                    className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#ff4e00]/30 transition-all text-left group"
                  >
                    <h4 className="text-white font-medium mb-1 group-hover:text-[#ff4e00] transition-colors">{item.title}</h4>
                    <p className="text-white/40 text-xs line-clamp-2">{item.prompt}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg) => (
                <ChatMessageComponent 
                  key={msg.id} 
                  message={msg} 
                  onRegenerateAudio={handleRegenerateAudio}
                />
              ))}
              
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start mb-6"
                >
                  <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#ff4e00]" />
                    <span className="text-sm text-white/60 italic font-serif">{status}</span>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </main>

        {/* Input Area */}
        <footer className="p-4 w-full max-w-4xl mx-auto">
          <div className="glass-panel p-2 flex items-center gap-2 relative">
            <button 
              onClick={toggleListening}
              className={`p-3 transition-colors ${isListening ? 'text-[#ff4e00] animate-pulse' : 'text-white/40 hover:text-[#ff4e00]'}`}
            >
              {isListening ? <Mic size={20} /> : <Mic size={20} />}
            </button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Describe your podcast topic..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20 px-2"
            />
            <div className="flex items-center gap-1">
              {currentSessionId && (
                <button 
                  onClick={() => {
                    const lastUserMsg = [...messages].reverse().find(m => m.role === MessageRole.USER);
                    if (lastUserMsg) handleSend(lastUserMsg.content);
                  }}
                  title="Regenerate"
                  className="p-3 text-white/40 hover:text-white transition-colors"
                >
                  <RotateCcw size={18} />
                </button>
              )}
              <button 
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`p-3 rounded-xl transition-all ${
                  (input.trim() || !currentSessionId) && !isLoading 
                    ? 'bg-[#ff4e00] text-white shadow-lg shadow-[#ff4e00]/20' 
                    : 'bg-white/5 text-white/20'
                }`}
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
          <div className="flex justify-center mt-3">
            <p className="text-[10px] text-white/20 font-mono uppercase tracking-[0.2em]">
              Powered by Gemini 2.5 Flash & 3.1 Pro
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
