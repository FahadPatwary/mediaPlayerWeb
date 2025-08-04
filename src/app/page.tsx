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
  const [audioEnhanced, setAudioEnhanced] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [currentFile, setCurrentFile] = useState<string>('');
  
  // Floating sync button state
  const [syncButtonPosition, setSyncButtonPosition] = useState({ x: 50, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isSyncAnimating, setIsSyncAnimating] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaSyncSocketRef = useRef<Socket | null>(null);
  
  // Audio enhancement refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);

  // Sync state variables
  const lastSyncTimeRef = useRef(0);
  const syncThreshold = 0.3;
  const isManuallySyncingRef = useRef(false);
  const isRemoteUpdateRef = useRef(false);

  // Initialize audio enhancement
  const initializeAudioEnhancement = () => {
    if (!videoRef.current || audioEnhanced) return;
    
    try {
      // Create audio context
       const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
       if (!AudioContextClass) {
         throw new Error('Web Audio API not supported');
       }
       const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      
      // Create source node from video element
      const sourceNode = audioContext.createMediaElementSource(videoRef.current);
      sourceNodeRef.current = sourceNode;
      
      // Create gain node for volume boost
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volumeBoost;
      gainNodeRef.current = gainNode;
      
      // Create compressor for dynamic range control
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressorRef.current = compressor;
      
      // Create EQ filters for audio enhancement
      const frequencies = [60, 170, 350, 1000, 3500, 10000];
      const eqNodes: BiquadFilterNode[] = [];
      
      frequencies.forEach((freq, index) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = index < 2 ? 3 : index > 3 ? 2 : 1; // Boost bass and treble slightly
        eqNodes.push(filter);
      });
      eqNodesRef.current = eqNodes;
      
      // Connect the audio chain
      sourceNode.connect(gainNode);
      gainNode.connect(compressor);
      
      // Chain EQ filters
      let currentNode: AudioNode = compressor;
      eqNodes.forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      
      // Connect to destination
      currentNode.connect(audioContext.destination);
      
      setAudioEnhanced(true);
      console.log('🎵 Audio enhancement initialized');
      
    } catch (error) {
      console.error('Failed to initialize audio enhancement:', error);
    }
  };
  
  // Clean up audio enhancement
  const cleanupAudioEnhancement = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    compressorRef.current = null;
    eqNodesRef.current = [];
    setAudioEnhanced(false);
  };

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
      cleanupAudioEnhancement();
    };
  }, []);

  // Handle app loading and first visit
  useEffect(() => {
    const handleAppLoad = async () => {
      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsAppLoading(false);
      
      // Check if this is the first visit
      const hasVisited = localStorage.getItem('hasVisitedMediaPlayer');
      if (!hasVisited) {
        setTimeout(() => {
          setShowWelcomeModal(true);
          localStorage.setItem('hasVisitedMediaPlayer', 'true');
        }, 500);
      }
    };
    
    handleAppLoad();
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

    // Trigger icon animation
    setIsSyncAnimating(true);
    setTimeout(() => setIsSyncAnimating(false), 1000);

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
      setIsFileLoading(true);
      
      // Clean up previous audio enhancement
      cleanupAudioEnhancement();
      
      const url = URL.createObjectURL(file);
      videoRef.current.src = url;
      setCurrentFile(file.name);
      
      // Initialize audio enhancement after video loads
      videoRef.current.addEventListener('loadedmetadata', () => {
        initializeAudioEnhancement();
        setIsFileLoading(false);
      }, { once: true });
      
      // Handle loading errors
      videoRef.current.addEventListener('error', () => {
        setIsFileLoading(false);
      }, { once: true });
      
      showNotification(`✅ Loaded: ${file.name}`);
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
    
    // Update Web Audio API gain if available
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value;
    } else if (videoRef.current) {
      // Fallback to HTML5 video volume (limited to 1.0)
      videoRef.current.volume = Math.min(value, 1);
    }
  };

  // Theme toggle
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // Floating sync button drag handlers
  const handleSyncButtonMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleSyncButtonMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setSyncButtonPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleSyncButtonMouseUp = () => {
    setIsDragging(false);
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

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
    
    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Handle drag events for floating sync button
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleSyncButtonMouseMove);
      document.addEventListener('mouseup', handleSyncButtonMouseUp);
    } else {
      document.removeEventListener('mousemove', handleSyncButtonMouseMove);
      document.removeEventListener('mouseup', handleSyncButtonMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleSyncButtonMouseMove);
      document.removeEventListener('mouseup', handleSyncButtonMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div className={`h-screen overflow-hidden font-sans transition-colors duration-300 ${
      isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Loading Animation */}
      {isAppLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
          <div className="text-center animate-fade-in-scale">
            <div className="relative mb-6">
              <div className="w-24 h-24 border-4 border-blue-200 dark:border-blue-400 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto animate-pulse-glow"></div>
              <div className="absolute inset-0 w-24 h-24 border-4 border-transparent border-r-purple-600 dark:border-r-purple-400 rounded-full animate-spin mx-auto" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl animate-pulse">🎵</span>
              </div>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-3">Media Player</h2>
            <p className="text-gray-600 dark:text-gray-300 animate-pulse text-lg">Loading your experience...</p>
            <div className="mt-4 flex justify-center space-x-1">
              <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
              <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
              <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Modal */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in-scale p-3 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm sm:max-w-lg mx-4 shadow-2xl animate-slide-in-bottom border border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 animate-pulse-glow">
                <span className="text-2xl sm:text-3xl animate-bounce">🎵</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-3 sm:mb-4">Welcome to Media Player!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 leading-relaxed text-base sm:text-lg">
                A synchronized video watching experience with advanced audio enhancement. 
                Create rooms, invite friends, and enjoy media together with volume boosting up to 500%!
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <div className="text-center p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg sm:rounded-xl">
                  <div className="text-xl sm:text-2xl mb-1 sm:mb-2">🔊</div>
                  <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300">Audio Boost</div>
                </div>
                <div className="text-center p-3 sm:p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg sm:rounded-xl">
                  <div className="text-xl sm:text-2xl mb-1 sm:mb-2">👥</div>
                  <div className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-300">Sync Rooms</div>
                </div>
                <div className="text-center p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg sm:rounded-xl">
                  <div className="text-xl sm:text-2xl mb-1 sm:mb-2">🎬</div>
                  <div className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300">Media Player</div>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">
                  <strong>Created by:</strong> Fahad Patwary
                </p>
                <a 
                  href="https://github.com/FahadPatwary/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 text-sm transition-all duration-200 hover:scale-105"
                >
                  <span className="mr-1">🔗</span> github.com/FahadPatwary
                </a>
              </div>
              <button
                onClick={() => setShowWelcomeModal(false)}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-lg sm:rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg text-sm sm:text-base"
              >
                Get Started 🚀
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Notification */}
      {notification.visible && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg cursor-pointer transition-all duration-300 z-50 animate-fade-in ${
          notification.type === 'success' 
            ? 'bg-green-500 dark:bg-green-600 border border-green-400 dark:border-green-500' 
            : 'bg-red-500 dark:bg-red-600 border border-red-400 dark:border-red-500'
        } text-white`}>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Loading Spinner Overlay */}
      {(isLoading || isVideoLoading) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
          <div className="relative bg-white dark:bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-200 dark:border-gray-600">
            <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-600 border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin mx-auto"></div>
            <div className="mt-4 text-gray-800 dark:text-gray-200 text-center font-medium">
              {isVideoLoading ? 'Loading video...' : 'Loading...'}
            </div>
          </div>
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

      {/* Main Grid Layout */}
      <div className="h-full grid grid-rows-[auto_1fr_auto] max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* Header Section */}
          <header className="py-4 sm:py-6 text-center">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-3 sm:mb-4 text-gray-800 dark:text-white">🎬 Media Player</h1>
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-6 text-xs sm:text-sm">
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
                <div className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-4">
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
                  {currentFile && currentFile.trim() !== '' && (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-600 dark:text-gray-400">Media:</span>
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium text-xs max-w-32 sm:max-w-48 truncate">
                        {currentFile}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

        {/* Main Content Area */}
        <div className="flex flex-col lg:grid lg:grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 min-h-0">
          {/* Video Player - Takes up 2/3 on extra large screens */}
          <div className="xl:col-span-2 flex items-center justify-center order-1">
            <div className="w-full h-full">
              <video
                ref={videoRef}
                className="w-full h-full max-h-[35vh] sm:max-h-[45vh] md:max-h-[55vh] lg:max-h-[60vh] xl:max-h-[70vh] rounded-lg sm:rounded-xl shadow-lg bg-gray-900 object-contain"
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

          {/* Control Panel - Takes up 1/3 on extra large screens, full width on smaller */}
           <div className="xl:col-span-1 order-2">
             <div className="space-y-4 sm:space-y-6 max-h-[45vh] lg:max-h-[50vh] xl:max-h-none overflow-y-auto xl:overflow-visible">
               {/* Media Controls */}
                <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3 lg:mb-4 text-gray-800 dark:text-gray-200 flex items-center">
                   🎮 <span className="ml-1 sm:ml-2">Media Controls</span>
                   {isFileLoading && (
                     <div className="ml-2 w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                   )}
                 </h3>
                 <div className="space-y-2 sm:space-y-3">
                   <button
                     onClick={openFileDialog}
                     disabled={isLoading || isFileLoading}
                     className={`w-full font-medium px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-md sm:rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 text-xs sm:text-sm lg:text-base shadow-sm hover:shadow-md ${
                       isLoading || isFileLoading
                         ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                         : 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 hover:scale-105'
                     } text-white`}
                   >
                     {isFileLoading ? (
                       <>
                         <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                         <span>Processing...</span>
                       </>
                     ) : isLoading ? (
                       'Loading...'
                     ) : (
                       <>
                         <span>📁</span>
                         <span>Load Media File</span>
                       </>
                     )}
                   </button>
                   
                   {isFileLoading && (
                     <div className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                       <div className="flex items-center">
                         <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                         <span>Loading media file and initializing audio enhancement...</span>
                       </div>
                     </div>
                   )}
                 </div>
               </div>



               {/* Volume Control */}
               <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                   <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                     🔊 <span className="ml-1 sm:ml-2">Volume Boost</span>
                   </h3>
                   <div className="flex items-center space-x-1 sm:space-x-2">
                     <span className={`text-xs sm:text-sm font-bold transition-all duration-300 ${
                       volumeBoost > 1 ? 'text-orange-500 animate-pulse' : 'text-gray-600 dark:text-gray-400'
                     }`}>
                       {Math.round(volumeBoost * 100)}%
                     </span>
                     {audioEnhanced && (
                       <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs rounded-full animate-pulse-glow">
                         Enhanced
                       </span>
                     )}
                   </div>
                 </div>
                 
                 <div className="relative">
                   <input
                      type="range"
                      min="0"
                      max={audioEnhanced ? "5" : "1"}
                      step="0.1"
                      value={volumeBoost}
                      onChange={handleVolumeBoost}
                      data-high-volume={volumeBoost > 2}
                      className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      style={{
                        background: `linear-gradient(to right, 
                          ${volumeBoost <= 1 ? '#3b82f6' : volumeBoost <= 2 ? '#f59e0b' : '#ef4444'} 0%, 
                          ${volumeBoost <= 1 ? '#3b82f6' : volumeBoost <= 2 ? '#f59e0b' : '#ef4444'} ${(volumeBoost / (audioEnhanced ? 5 : 1)) * 100}%, 
                          #e5e7eb ${(volumeBoost / (audioEnhanced ? 5 : 1)) * 100}%, 
                          #e5e7eb 100%)`
                      }}
                    />
                   
                   {/* Volume level indicators */}
                   <div className="flex justify-between mt-2 px-1">
                     <span className={`text-xs transition-all duration-200 ${
                       volumeBoost >= 0 ? 'text-blue-500 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                     }`}>0%</span>
                     <span className={`text-xs transition-all duration-200 ${
                       volumeBoost >= 0.5 ? 'text-blue-500 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                     }`}>50%</span>
                     <span className={`text-xs transition-all duration-200 ${
                       volumeBoost >= 1 ? 'text-orange-500 dark:text-orange-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                     }`}>100%</span>
                     {audioEnhanced && (
                       <>
                         <span className={`text-xs transition-all duration-200 ${
                           volumeBoost >= 2 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                         }`}>200%</span>
                         <span className={`text-xs transition-all duration-200 ${
                           volumeBoost >= 3 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                         }`}>300%</span>
                         <span className={`text-xs transition-all duration-200 ${
                           volumeBoost >= 4 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'
                         }`}>400%</span>
                         <span className={`text-xs transition-all duration-200 ${
                           volumeBoost >= 5 ? 'text-red-700 dark:text-red-400 font-bold animate-pulse' : 'text-gray-400 dark:text-gray-500'
                         }`}>500%</span>
                       </>
                     )}
                   </div>
                 </div>
                 
                 {audioEnhanced && (
                   <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                     <p className="text-xs text-blue-600 dark:text-blue-300 flex items-center">
                       <span className="mr-1">🎵</span>
                       Audio enhancement active with compression and EQ
                     </p>
                   </div>
                 )}
                 
                 {volumeBoost > 2 && (
                   <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-700">
                     <p className="text-xs text-orange-600 dark:text-orange-300 flex items-center">
                       <span className="mr-1">⚠️</span>
                       High volume boost active - may cause distortion
                     </p>
                   </div>
                 )}
               </div>

               {/* Room Controls */}
               <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                 <h3 className="text-sm sm:text-base lg:text-lg font-semibold mb-2 sm:mb-3 lg:mb-4 text-gray-800 dark:text-gray-200 flex items-center">
                   🏠 <span className="ml-1 sm:ml-2">Room Management</span>
                 </h3>
                 <div className="space-y-2 sm:space-y-3">
                   <input
                     type="text"
                     value={roomCode}
                     onChange={(e) => setRoomCode(e.target.value)}
                     placeholder="Enter Room Code"
                     className="w-full px-2 sm:px-3 py-2 sm:py-2.5 lg:py-3 rounded-md sm:rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 text-xs sm:text-sm lg:text-base transition-all duration-200"
                     disabled={isLoading}
                   />
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                     <button
                       onClick={createRoom}
                       className="py-2 sm:py-2.5 lg:py-3 px-2 sm:px-3 lg:px-4 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-md sm:rounded-lg font-medium transition-all duration-200 text-xs sm:text-sm lg:text-base flex items-center justify-center shadow-sm hover:shadow-md"
                       disabled={isLoading}
                     >
                       {isLoading ? (
                         <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                       ) : (
                         'Create'
                       )}
                     </button>
                     <button
                       onClick={handleJoinRoom}
                       className="py-2 sm:py-2.5 lg:py-3 px-2 sm:px-3 lg:px-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-md sm:rounded-lg font-medium transition-all duration-200 text-xs sm:text-sm lg:text-base flex items-center justify-center shadow-sm hover:shadow-md"
                       disabled={isLoading || !roomCode.trim()}
                     >
                       {isLoading ? (
                         <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                       ) : (
                         'Join'
                       )}
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           </div>
        </div>

        {/* Footer */}
         <footer className="py-3 sm:py-4 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
           <p className="mb-1 sm:mb-2">Media Player Web - Synchronized Video Watching</p>
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
          <>             <svg 
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
             {/* Ripple effect */}
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
