import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Download, FileText, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PodcastData } from '../types';
import { pcmToWavBlob } from '../utils/audio';
import Markdown from 'react-markdown';

interface PodcastPlayerProps {
  podcast: PodcastData;
  onRegenerate?: () => void;
}

export const PodcastPlayer: React.FC<PodcastPlayerProps> = ({ podcast, onRegenerate }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showScript, setShowScript] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (podcast.audioBase64) {
      const blob = pcmToWavBlob(podcast.audioBase64);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        return () => {
          URL.revokeObjectURL(url);
        };
      }
    }
  }, [podcast.audioBase64]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="player-chrome p-4 w-full max-w-md mt-2"
    >
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-mono uppercase tracking-widest text-[#ff4e00] opacity-70">Now Playing</span>
            <h3 className="text-sm font-medium text-white truncate max-w-[200px]">{podcast.title}</h3>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowScript(!showScript)}
              className={`p-1.5 rounded-full transition-colors ${showScript ? 'bg-[#ff4e00]/20 text-[#ff4e00]' : 'hover:bg-white/10 text-white/60'}`}
              title="View Script"
            >
              <FileText size={16} />
            </button>
            {audioUrl && (
              <a 
                href={audioUrl} 
                download={`${podcast.title.replace(/\s+/g, '_')}.wav`}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
              >
                <Download size={16} className="text-white/60" />
              </a>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showScript && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-black/20 rounded-xl p-3 text-[11px] font-sans text-white/60 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar border border-white/5">
                <Markdown>{podcast.script}</Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-1">
          <input 
            type="range" 
            min="0" 
            max={duration || 0} 
            value={currentTime} 
            onChange={handleSeek}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff4e00]"
          />
          <div className="flex justify-between text-[10px] font-mono text-white/40">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6">
          <button className="text-white/40 hover:text-white transition-colors">
            <SkipBack size={20} />
          </button>
          {!podcast.audioBase64 ? (
            <button 
              onClick={onRegenerate}
              className="flex items-center gap-2 px-4 py-2 bg-[#ff4e00] text-white rounded-full hover:bg-[#ff4e00]/80 transition-colors text-xs font-medium"
            >
              <RefreshCw size={14} className="animate-spin-slow" />
              Restore Audio
            </button>
          ) : (
            <button 
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>
          )}
          <button className="text-white/40 hover:text-white transition-colors">
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
