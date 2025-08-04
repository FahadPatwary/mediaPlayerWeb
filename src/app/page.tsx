'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

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
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: 'success',
    visible: false
  });
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [volumeBoost, setVolumeBoost] = useState(1);
  const [isConnected, setIsConnected] = useState(false);
  const [platform, setPlatform] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaSyncSocketRef = useRef<Socket | null>(null);

  // Sync state variables
  const lastSyncTimeRef = useRef(0);
  const syncThreshold = 0.3;
  const isManuallySyncingRef = useRef(false);
  const isRemoteUpdateRef = useRef(false);

  // Initialize socket connection
  useEffect(() => {
    const userAgent = navigator.userAgent;
    const platformInfo = navigator.platform || 'Unknown';
    setPlatform(platformInfo);
    console.log('🖥️ Platform Info:', { platform: platformInfo, userAgent });

    // Initialize Socket.IO connection
    const mediaSyncSocket = io('https://seriousserver.onrender.com', {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      forceNew: true
    });

    mediaSyncSocketRef.current = mediaSyncSocket;

    // Socket event handlers
    mediaSyncSocket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to media sync server');
      console.log('🔗 Connection details:', {
        platform: platformInfo,
        transport: mediaSyncSocket.io.engine.transport.name,
        socketId: mediaSyncSocket.id
      });
      showNotification('🔗 Connected to sync server', 'success');
    });

    mediaSyncSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('❌ Disconnected from media sync server:', reason);
      showNotification(`❌ Disconnected: ${reason}`, 'error');
    });

    mediaSyncSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      showNotification('❌ Connection failed. Check your internet.', 'error');
    });

    mediaSyncSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
      showNotification('🔄 Reconnected to sync server', 'success');
    });

    mediaSyncSocket.on('reconnect_error', (error) => {
      console.error('❌ Reconnection failed:', error);
      showNotification('❌ Reconnection failed', 'error');
    });

    // Listen for sync updates
    mediaSyncSocket.on('syncMedia', ({ mediaState }: { mediaState: MediaState }) => {
      if (!mediaState || isManuallySyncingRef.current) {
        console.log('📥 Sync ignored:', { hasMediaState: !!mediaState, isManuallySyncing: isManuallySyncingRef.current });
        return;
      }

      console.log('📥 Received sync data:', mediaState);
      isRemoteUpdateRef.current = true;
      
      const video = videoRef.current;
      if (!video) return;

      const currentTime = video.currentTime;
      const timeDiff = Math.abs(currentTime - mediaState.currentTime);

      console.log('🔍 Sync analysis:', {
        currentTime,
        remoteTime: mediaState.currentTime,
        timeDiff,
        threshold: syncThreshold,
        willAdjustTime: timeDiff > syncThreshold,
        currentlyPlaying: !video.paused,
        shouldPlay: mediaState.isPlaying
      });

      // Adjust time if out of sync
      if (timeDiff > syncThreshold) {
        console.log(`⏰ Adjusting time from ${currentTime} to ${mediaState.currentTime}`);
        video.currentTime = mediaState.currentTime;
      }

      // Ensure play/pause sync
      if (mediaState.isPlaying !== !video.paused) {
        if (mediaState.isPlaying) {
          console.log('▶️ Remote play command');
          video.play();
        } else {
          console.log('⏸️ Remote pause command');
          video.pause();
        }
      }

      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 500);
    });

    return () => {
      mediaSyncSocket.disconnect();
    };
  }, []);

  // Show notification function
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type, visible: true });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  // Room management functions
  const joinRoom = (room: string) => {
    if (!isConnected) {
      showNotification('❌ Not connected to sync server. Please wait...', 'error');
      return;
    }
    
    const socket = mediaSyncSocketRef.current;
    if (socket) {
      socket.emit('joinRoom', room);
      setCurrentRoom(room);
      console.log(`🏠 Joining room: ${room}`);
      showNotification(`✅ Joined Room: ${room}`);
    }
  };

  const createRoom = async () => {
    setIsLoading(true);
    try {
      const room = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomCode(room);
      joinRoom(room);
    } catch (error) {
      showNotification('Failed to create room', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (roomCode.trim()) {
      setIsLoading(true);
      try {
        joinRoom(roomCode.trim());
      } catch (error) {
        showNotification('Failed to join room', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Media sync function
  const syncMediaState = () => {
    if (!currentRoom || !isConnected) {
      if (!isConnected) {
        console.warn('⚠️ Cannot sync: Not connected to server');
      }
      return;
    }

    const now = Date.now();
    if (now - lastSyncTimeRef.current < 1500) return; // Throttle sync updates
    lastSyncTimeRef.current = now;

    const video = videoRef.current;
    if (!video) return;

    const mediaState = { currentTime: video.currentTime, isPlaying: !video.paused };
    console.log('📤 Sending sync data:', mediaState);
    
    const socket = mediaSyncSocketRef.current;
    if (socket) {
      socket.emit('syncMedia', { roomId: currentRoom, mediaState });
    }
  };

  // Video event handlers
  const handlePlay = () => {
    if (!isRemoteUpdateRef.current) {
      syncMediaState();
    }
  };

  const handlePause = () => {
    if (!isRemoteUpdateRef.current) {
      syncMediaState();
    }
  };

  const handleSeeked = () => {
    if (!isRemoteUpdateRef.current) {
      syncMediaState();
    }
  };

  // File handling
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && videoRef.current) {
      setIsLoading(true);
      const url = URL.createObjectURL(file);
      videoRef.current.src = url;
      showNotification(`✅ Loaded: ${file.name}`);
      setIsLoading(false);
    }
  };

  // Handle video loading events
  const handleVideoLoadStart = () => {
    setIsVideoLoading(true);
  };

  const handleVideoCanPlay = () => {
    setIsVideoLoading(false);
  };

  const handleVideoWaiting = () => {
    setIsVideoLoading(true);
  };

  const handleVideoPlaying = () => {
    setIsVideoLoading(false);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  // Volume boost handler
  const handleVolumeBoost = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    setVolumeBoost(value);
    if (videoRef.current) {
      videoRef.current.volume = Math.min(value, 1);
    }
  };

  // Theme toggle
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Copy room code to clipboard
  const copyRoomToClipboard = async () => {
    if (currentRoom) {
      try {
        await navigator.clipboard.writeText(currentRoom);
        showNotification('Room code copied to clipboard!', 'success');
      } catch (err) {
        console.error('Failed to copy room code:', err);
        showNotification('Failed to copy room code', 'error');
      }
    }
  };

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className={`h-screen overflow-hidden font-sans transition-colors duration-300 ${
      isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Notification */}
      {notification.visible && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg cursor-pointer transition-all duration-300 z-50 animate-fade-in ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Loading Spinner Overlay */}
      {(isLoading || isVideoLoading) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="mt-4 text-white text-center font-medium">
              {isVideoLoading ? 'Loading video...' : 'Loading...'}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Main Grid Layout */}
      <div className="h-full grid grid-rows-[auto_1fr_auto] max-w-7xl mx-auto px-4">
        {/* Header Section */}
          <header className="py-6 text-center">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold mb-4 text-gray-800 dark:text-white">🎬 Media Player</h1>
              <div className="flex items-center justify-center space-x-6 text-sm">
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                  isConnected 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <span className="font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Room:</span>
                  {currentRoom ? (
                    <button
                      onClick={copyRoomToClipboard}
                      className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors duration-200"
                      title="Click to copy room code"
                    >
                      {currentRoom}
                    </button>
                  ) : (
                    <span className="text-gray-400 font-medium">Not connected</span>
                  )}
                </div>
              </div>
            </div>
          </header>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
          {/* Video Player - Takes up 2/3 on large screens */}
          <div className="lg:col-span-2 flex items-center justify-center">
            <div className="w-full h-full">
              <video
                ref={videoRef}
                className="w-full h-full max-h-[60vh] lg:max-h-[70vh] rounded-xl shadow-lg bg-gray-900 object-contain"
                controls
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
                onLoadStart={handleVideoLoadStart}
                onCanPlay={handleVideoCanPlay}
                onWaiting={handleVideoWaiting}
                onPlaying={handleVideoPlaying}
              />
            </div>
          </div>

          {/* Control Panel - Takes up 1/3 on large screens */}
           <div className="lg:col-span-1">
             <div className="space-y-6">
               {/* Media Controls */}
               <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Media Controls</h3>
                 <div className="space-y-3">
                   <button
                     onClick={syncMediaState}
                     disabled={isLoading}
                     className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                   >
                     {isLoading ? 'Syncing...' : '🔄 Sync Media'}
                   </button>
                   
                   <button
                     onClick={openFileDialog}
                     disabled={isLoading}
                     className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                   >
                     {isLoading ? 'Loading...' : '📁 Load File'}
                   </button>
                 </div>
               </div>

               {/* Volume Control */}
               <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Volume Boost</h3>
                 <div className="flex items-center space-x-4">
                   <input
                     type="range"
                     min="1"
                     max="3"
                     step="0.1"
                     value={volumeBoost}
                     onChange={handleVolumeBoost}
                     className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                   />
                   <span className="text-sm font-medium min-w-[3rem] text-gray-600 dark:text-gray-400">
                     {volumeBoost.toFixed(1)}x
                   </span>
                 </div>
               </div>

               {/* Room Controls */}
               <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Room Management</h3>
                 <div className="space-y-3">
                   <input
                     type="text"
                     value={roomCode}
                     onChange={(e) => setRoomCode(e.target.value)}
                     placeholder="Enter Room Code"
                     className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                     disabled={isLoading}
                   />
                   <div className="grid grid-cols-2 gap-2">
                     <button
                       onClick={createRoom}
                       className="py-2 px-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200"
                       disabled={isLoading}
                     >
                       {isLoading ? 'Creating...' : 'Create'}
                     </button>
                     <button
                       onClick={handleJoinRoom}
                       className="py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200"
                       disabled={isLoading || !roomCode.trim()}
                     >
                       {isLoading ? 'Joining...' : 'Join'}
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           </div>
        </div>

        {/* Footer */}
         <footer className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
           <p className="mb-1">Media Player Web - Synchronized Video Watching</p>
           <p className="text-xs">
             © 2025 by{' '}
             <a
               href="https://github.com/FahadPatwary"
               className="text-blue-500 hover:text-blue-600 transition-colors"
               target="_blank"
               rel="noopener noreferrer"
             >
               Fahad Ahmed Patwary
             </a>
           </p>
         </footer>
      </div>

      {/* Floating Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 focus:outline-none transform transition-all duration-200 hover:scale-110 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 p-3 rounded-full shadow-lg z-40"
        aria-label="Theme Toggle"
      >
        {isDarkMode ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
