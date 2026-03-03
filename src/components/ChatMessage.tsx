import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChatMessage, MessageRole } from '../types';
import { PodcastPlayer } from './PodcastPlayer';
import Markdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessage;
  onRegenerateAudio?: (messageId: string, script: string) => void;
}

export const ChatMessageComponent: React.FC<ChatMessageProps> = ({ message, onRegenerateAudio }) => {
  const isUser = message.role === MessageRole.USER;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-6 group`}
    >
      <div className={`relative max-w-[85%] px-4 py-3 rounded-2xl ${
        isUser 
          ? 'bg-[#ff4e00] text-white rounded-tr-none' 
          : 'bg-white/5 border border-white/10 text-[#e0d8d0] rounded-tl-none'
      }`}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          <Markdown>{message.content}</Markdown>
        </div>
        
        {!isUser && (
          <button 
            onClick={handleCopy}
            className="absolute -right-8 top-0 p-1.5 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        )}
      </div>
      
      {message.podcast && (
        <PodcastPlayer 
          podcast={message.podcast} 
          onRegenerate={() => onRegenerateAudio?.(message.id, message.podcast!.script)}
        />
      )}
      
      <span className="text-[10px] font-mono text-white/20 mt-1 uppercase tracking-tighter">
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </motion.div>
  );
};
