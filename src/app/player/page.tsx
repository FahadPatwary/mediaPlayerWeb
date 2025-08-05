'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';

interface MediaState {
  currentTime: number;
  isPlaying: boolean;
}

interface NotificationState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

export default function MediaPlayer() {
  // State variables
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [currentFile, setCurrentFile] = useState('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: 'success',
    visible: false
  });
  const [volumeBoost, setVolumeBoost] = useState(1);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [gainNode, setGainNode] = useState<GainNode | null>(null);
  const [sourceNode, setSourceNode] = useState<MediaElementAudioSourceNode | null>(null);
  const [isSyncAnimating, setIsSyncAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [syncButtonPosition, setSyncButtonPosition] = useState({ x: 20, y: 100 });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaSyncSocketRef = useRef<Socket | null>(null);

  // Server URL - Use deployed server for production
  const serverUrl = process.env.NODE_ENV === 'production' 
    ? 'https://seriousserver.onrender.com' 
    : 'http://localhost:3002';

  // Initialize Socket.IO connection
  useEffect(() => {
    const mediaSyncSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    mediaSyncSocketRef.current = mediaSyncSocket;

    mediaSyncSocket.on('connect', () => {
      console.log('Connected to media sync server');
      setIsConnected(true);
    });

    mediaSyncSocket.on('disconnect', () => {
      console.log('Disconnected from media sync server');
      setIsConnected(false);
    });

    mediaSyncSocket.on('connect_error', (error: Error) => {
      console.error('Connection error:', {
        message: error.message,
        serverUrl,
        error: error
      });
      setIsConnected(false);
      showNotification(`Connection failed: ${error.message}`, 'error');
    });

    mediaSyncSocket.on('reconnect', () => {
      console.log('Reconnected to media sync server');
      setIsConnected(true);
      showNotification('Reconnected to server', 'success');
    });

    mediaSyncSocket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
      showNotification('Reconnection failed', 'error');
    });

    mediaSyncSocket.on('roomCreated', (data) => {
      console.log('Room created:', data);
      setCurrentRoom(data.roomCode);
      setIsLoading(false);
      showNotification(`Room created: ${data.roomCode}`, 'success');
    });

    mediaSyncSocket.on('roomJoined', (data) => {
      console.log('Room joined:', data);
      setCurrentRoom(data.roomCode);
      setIsLoading(false);
      showNotification(`Joined room: ${data.roomCode}`, 'success');
    });

    mediaSyncSocket.on('roomError', (error) => {
      console.error('Room error:', error);
      setIsLoading(false);
      showNotification(error.message || 'Room operation failed', 'error');
    });

    mediaSyncSocket.on('syncMedia', (data: { mediaState: MediaState }) => {
      console.log('Received sync data:', data);
      if (videoRef.current && data.mediaState) {
        const timeDiff = Math.abs(videoRef.current.currentTime - data.mediaState.currentTime);
        if (timeDiff > 1) {
          videoRef.current.currentTime = data.mediaState.currentTime;
          console.log('Synced video time to:', data.mediaState.currentTime);
        }
        if (data.mediaState.isPlaying && videoRef.current.paused) {
          videoRef.current.play();
          console.log('Started video playback');
        } else if (!data.mediaState.isPlaying && !videoRef.current.paused) {
          videoRef.current.pause();
          console.log('Paused video playback');
        }
        showNotification('Received sync from another user', 'success');
      }
    });

    mediaSyncSocket.on('error', (error) => {
      showNotification(error.message, 'error');
    });

    return () => {
      mediaSyncSocket.disconnect();
    };
  }, []);

  // Dark mode effect
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Utility functions
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type, visible: true });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      showNotification('Dark mode enabled', 'success');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      showNotification('Light mode enabled', 'success');
    }
    
    console.log('Theme toggled to:', newDarkMode ? 'dark' : 'light');
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsFileLoading(true);
      setIsVideoLoading(true);
      const url = URL.createObjectURL(file);
      setCurrentFile(url);
      setCurrentFileName(file.name);
      
      if (videoRef.current) {
        const video = videoRef.current;
        let hasLoaded = false;
        
        // Clear any existing event listeners
        video.onloadeddata = null;
        video.onerror = null;
        video.oncanplay = null;
        
        // Set up event handlers
        const handleLoadSuccess = () => {
          if (hasLoaded) return; // Prevent multiple calls
          hasLoaded = true;
          setIsFileLoading(false);
          setIsVideoLoading(false);
          initializeAudioEnhancement();
          showNotification(`Loaded: ${file.name}`, 'success');
          clearTimeout(timeoutId);
          console.log('Video loaded successfully');
        };
        
        const handleLoadError = (error?: Event) => {
          if (hasLoaded) return; // Prevent multiple calls
          hasLoaded = true;
          setIsFileLoading(false);
          setIsVideoLoading(false);
          showNotification('Error loading file', 'error');
          clearTimeout(timeoutId);
          console.error('Video loading error:', error);
        };
        
        // Set timeout fallback
        const timeoutId = setTimeout(() => {
          if (!hasLoaded) {
            console.log('Video loading timeout, forcing completion');
            hasLoaded = true;
            setIsFileLoading(false);
            setIsVideoLoading(false);
            showNotification('File loaded (timeout)', 'success');
            initializeAudioEnhancement();
          }
        }, 3000); // 3 second timeout
        
        // Add event listeners
        video.addEventListener('loadeddata', handleLoadSuccess, { once: true });
        video.addEventListener('canplaythrough', handleLoadSuccess, { once: true });
        video.addEventListener('error', handleLoadError, { once: true });
        
        // Set the source and load
        video.src = url;
        video.load();
        
        console.log('Started loading video:', file.name);
      } else {
        // If no video ref, just clear the loading states
        setIsFileLoading(false);
        setIsVideoLoading(false);
        showNotification('Video element not ready', 'error');
      }
    }
  };

  const initializeAudioEnhancement = () => {
    if (videoRef.current && !audioContext) {
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        const source = ctx.createMediaElementSource(videoRef.current);
        const gain = ctx.createGain();
        
        source.connect(gain);
        gain.connect(ctx.destination);
        
        setAudioContext(ctx);
        setGainNode(gain);
        setSourceNode(source);
        
        console.log('Audio enhancement initialized');
      } catch (error) {
        console.error('Failed to initialize audio enhancement:', error);
      }
    }
  };

  const syncMediaState = () => {
    if (!mediaSyncSocketRef.current || !videoRef.current || !currentRoom) {
      showNotification('Cannot sync: No room joined or video loaded', 'error');
      return;
    }
    setIsSyncAnimating(true);
    const mediaState: MediaState = {
      currentTime: videoRef.current.currentTime,
      isPlaying: !videoRef.current.paused
    };
    console.log('Syncing media state:', { roomId: currentRoom, mediaState });
    mediaSyncSocketRef.current.emit('syncMedia', { roomId: currentRoom, mediaState });
    showNotification('Media synced successfully!', 'success');
    setTimeout(() => setIsSyncAnimating(false), 1000);
  };

  const createRoom = () => {
    if (!mediaSyncSocketRef.current) {
      showNotification('Not connected to server', 'error');
      return;
    }
    setIsLoading(true);
    mediaSyncSocketRef.current.emit('createRoom');
    
    // Fallback timeout
    setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
        showNotification('Room creation timed out', 'error');
      }
    }, 10000);
  };

  const handleJoinRoom = () => {
    if (!roomCode.trim()) {
      showNotification('Please enter a room code', 'error');
      return;
    }
    if (!mediaSyncSocketRef.current) {
      showNotification('Not connected to server', 'error');
      return;
    }
    setIsLoading(true);
    mediaSyncSocketRef.current.emit('joinRoom', { roomCode: roomCode.trim() });
    
    // Fallback timeout
    setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
        showNotification('Join room timed out', 'error');
      }
    }, 10000);
  };

  const leaveRoom = () => {
    if (mediaSyncSocketRef.current && currentRoom) {
      mediaSyncSocketRef.current.emit('leaveRoom', { roomCode: currentRoom });
      setCurrentRoom(null);
      showNotification('Left room', 'success');
    }
  };

  const handleVolumeBoostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    setVolumeBoost(value);
    
    if (gainNode) {
      gainNode.gain.value = value;
      console.log('Volume boost set to:', value);
    }
    
    if (value > 2) {
      showNotification('⚠️ High volume boost may cause distortion', 'error');
    }
  };

  const copyRoomToClipboard = () => {
    if (currentRoom) {
      navigator.clipboard.writeText(currentRoom);
      showNotification('Room code copied to clipboard!', 'success');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setRoomCode(text.trim());
        showNotification('Room code pasted from clipboard!', 'success');
      } else {
        showNotification('Clipboard is empty', 'error');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      showNotification('Failed to paste from clipboard', 'error');
    }
  };

  const handleSyncButtonMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const startX = e.clientX - syncButtonPosition.x;
    const startY = e.clientY - syncButtonPosition.y;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 64, e.clientX - startX));
      const newY = Math.max(0, Math.min(window.innerHeight - 64, e.clientY - startY));
      setSyncButtonPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-all duration-300">
      {/* Notification */}
      {notification.visible && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ${
          notification.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,.mkv,.avi,.mov,.wmv,.flv,.webm,.m4v,.3gp,.ogv,.ts,.mts,.m2ts,.divx,.xvid,.rm,.rmvb,.asf,.vob,.dv,.f4v,.mp3,.wav,.flac,.aac,.ogg,.wma,.m4a,.opus,.aiff,.au,.ra,.amr,.3ga,.ac3,.dts,.ape,.tak,.tta,.wv,.mka,.mpc,.spx,.gsm,.voc,.snd,.caf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Navigation Header */}
      <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link href="/home" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">MP</span>
                </div>
                <h1 className="text-xl font-semibold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  Media Player
                </h1>
              </Link>
            </div>
            
            {/* Status Indicators */}
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm ${
                isConnected 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              
              {currentRoom && (
                <button
                  onClick={copyRoomToClipboard}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                  title="Click to copy room code"
                >
                  <span>Room: {currentRoom}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Media Player Section */}
          <div className="lg:col-span-2">
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
                {isVideoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-white font-medium">Loading media...</p>
                    </div>
                  </div>
                )}
                
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  controls
                  preload="metadata"
                  style={{ display: currentFile ? 'block' : 'none' }}
                />
                {!currentFile && (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-lg font-medium mb-2">No media loaded</p>
                      <p className="text-sm opacity-75">Load a media file to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Control Panel Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Media Controls Card */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Media Controls</h3>
                {isFileLoading && (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
              
              {/* Load Media Button */}
              <button
                onClick={openFileDialog}
                disabled={isLoading || isFileLoading}
                className={`w-full py-3 px-4 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center space-x-2 shadow-md hover:shadow-lg ${
                  isLoading || isFileLoading
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {isFileLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : isLoading ? (
                  'Loading...'
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    <span>Load Media File</span>
                  </>
                )}
              </button>
              
              {/* Current Media Info */}
              {currentFileName && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Currently Playing</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={currentFileName}>
                        {currentFileName}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Volume Boost Control */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Volume Boost
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {volumeBoost.toFixed(1)}x
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={volumeBoost}
                    onChange={handleVolumeBoostChange}
                    data-high-volume={volumeBoost > 2}
                    className="w-full h-3 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 dark:from-green-800 dark:via-yellow-800 dark:to-red-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>0.1x</span>
                    <span className="text-orange-500 dark:text-orange-400">2x</span>
                    <span className="text-red-500 dark:text-red-400">5x</span>
                  </div>
                </div>
                {volumeBoost > 2 && (
                  <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-700">
                    <p className="text-xs text-orange-600 dark:text-orange-300 flex items-center">
                      <span className="mr-1">⚠️</span>
                      High volume boost active - may cause distortion
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Room Controls Card */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Room Management</h3>
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              
              <div className="space-y-4">
                {/* Room Code Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="Enter Room Code"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    disabled={isLoading}
                  />
                  <button
                    onClick={pasteFromClipboard}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Paste from clipboard"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>
                </div>
                
                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={createRoom}
                    disabled={isLoading}
                    className="py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Create
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleJoinRoom}
                    disabled={isLoading || !roomCode.trim()}
                    className="py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        Join
                      </>
                    )}
                  </button>
                </div>
                
                {/* Leave Room Button */}
                {currentRoom && (
                  <button
                    onClick={leaveRoom}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Leave Room
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Created with ❤️ by{' '}
            <a
              href="https://github.com/FahadPatwary"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fahad Ahmed Patwary
            </a>
          </p>
        </div>
      </footer>

      {/* Floating Sync Button */}
      <button
        onMouseDown={handleSyncButtonMouseDown}
        onClick={!isDragging ? syncMediaState : undefined}
        disabled={isLoading}
        className={`fixed z-50 w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group ${isSyncAnimating ? 'animate-pulse' : ''} ${
            isLoading 
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 hover:scale-110 active:scale-95 cursor-move'
          } text-white border-2 border-white dark:border-gray-200 ${isDragging ? 'scale-110 animate-none' : ''}`}
        style={{
          left: `${syncButtonPosition.x}px`,
          top: `${syncButtonPosition.y}px`,
          userSelect: 'none'
        }}
        title="Drag to move • Click to sync media"
      >
        {isLoading ? (
          <div className="w-6 h-6 sm:w-7 sm:h-7 border-2 border-white dark:border-gray-200 border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <>
            <svg 
              className={`w-7 h-7 sm:w-8 sm:h-8 transition-transform duration-300 ${isSyncAnimating ? 'animate-spin' : 'group-hover:rotate-180'}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
            <div className="absolute inset-0 rounded-full bg-white dark:bg-gray-200 opacity-0 group-hover:opacity-20 group-hover:animate-ping"></div>
          </>
        )}
      </button>

      {/* Floating Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 focus:outline-none transform transition-all duration-300 hover:scale-110 active:scale-95 bg-white dark:bg-gray-800 text-gray-800 dark:text-white p-3 rounded-full shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-600 z-40 group"
        aria-label="Toggle Theme"
      >
        <div className="relative w-6 h-6 flex items-center justify-center">
          <span className={`absolute transition-all duration-300 ${isDarkMode ? 'opacity-100 rotate-0' : 'opacity-0 rotate-180'}`}>☀️</span>
          <span className={`absolute transition-all duration-300 ${isDarkMode ? 'opacity-0 -rotate-180' : 'opacity-100 rotate-0'}`}>🌙</span>
        </div>
      </button>
    </div>
  );
}