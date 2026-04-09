import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, useBlocker } from 'react-router-dom';
import { ArrowRight, Video, MessageSquare, Mic, User, Send, Bot, Waves, Clock3, LogOut } from 'lucide-react';
import { useSocketConnection } from '../context/SocketContext';
import api from '../utils/api';
import { getStoredToken } from '../utils/auth';
import { getApiBaseUrl } from '../utils/serviceUrls';
import { log } from '../utils/logger';
import './MeetingHub.css';

const BOOK_READ_TIMEOUT_MS = 120000;

const MeetingHub = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { socket, socketConnected, ensureConnected } = useSocketConnection();

  const initialPrefType = useMemo(() => {
    const candidate = String(location?.state?.prefType || 'text').trim().toLowerCase();
    if (candidate === 'voice' || candidate === 'video' || candidate === 'text') return candidate;
    return 'text';
  }, [location?.state?.prefType]);
  const isObjectId = React.useMemo(() => /^[a-f0-9]{24}$/i.test(String(bookId || '')), [bookId]);
  const meetRoomState = location?.state?.meetRoom || null;
  const parsedSourceRoute = React.useMemo(() => {
    if (!bookId) return null;
    const decoded = decodeURIComponent(String(bookId));
    const separator = decoded.indexOf(':');
    if (separator <= 0) return null;
    const source = decoded.slice(0, separator).trim().toLowerCase();
    const sourceId = decoded.slice(separator + 1).trim();
    if (!source || !sourceId) return null;
    return { source, sourceId, composite: decoded };
  }, [bookId]);
  const matchBookId = useMemo(
    () => String(meetRoomState?.canonical_book_id || bookId || '').trim(),
    [bookId, meetRoomState?.canonical_book_id],
  );

  const [phase, setPhase] = useState('preferences');
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState(null);
  const [matchRole, setMatchRole] = useState(null);
  const [partnerDisplayName, setPartnerDisplayName] = useState('Reader');
  const [messages, setMessages] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [matchNotice, setMatchNotice] = useState('');
  const [searchHint, setSearchHint] = useState('');
  const [bookFriendOffered, setBookFriendOffered] = useState(false);
  const [bookFriendSessionId, setBookFriendSessionId] = useState(null);
  const [bookFriendLoading, setBookFriendLoading] = useState(false);
  const [matchStats, setMatchStats] = useState(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [searchingDots, setSearchingDots] = useState('.');
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [leavePromptBody, setLeavePromptBody] = useState('You will disconnect from this reader.');
  const pendingLeaveActionRef = useRef(null);
  const socketRef = useRef(socket);
  const searchIntervalRef = useRef(null);
  const cleanupInFlightRef = useRef(false);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const roomIdRef = useRef(null);
  const startCallRef = useRef(null);
  const [mediaStatus, setMediaStatus] = useState('idle');
  const [mediaError, setMediaError] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [prefType, setPrefType] = useState(initialPrefType);
  const lastSafeHashRef = useRef(typeof window !== 'undefined' ? window.location.hash : '');

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (meetRoomState?.title) {
          setBook({
            _id: matchBookId,
            id: matchBookId,
            title: meetRoomState.title,
            author: meetRoomState.author || 'Unknown author',
            source: meetRoomState.source,
            sourceId: meetRoomState.source_book_id,
          });
          return;
        }

        if (parsedSourceRoute) {
          const { data: readData } = await api.get('/books/read', {
            timeout: BOOK_READ_TIMEOUT_MS,
            params: {
              source: parsedSourceRoute.source,
              id: parsedSourceRoute.sourceId,
            },
          });
          const payload = readData?.data || readData;
          setBook({
            _id: matchBookId || parsedSourceRoute.composite,
            id: matchBookId || parsedSourceRoute.composite,
            title: payload?.title || 'Untitled',
            author: payload?.author || 'Unknown author',
            source: parsedSourceRoute.source,
            sourceId: parsedSourceRoute.sourceId,
          });
          return;
        }

        if (isObjectId) {
          const { data } = await api.get(`/books/${bookId}`);
          setBook(data);
          return;
        }

        setBook({ _id: matchBookId, id: matchBookId, title: 'Discussion Room', author: 'Verified book', source: '', sourceId: '' });
      } catch (error) {
        console.error('Fetch error:', error);
        setBook(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const activeSocket = socketRef.current;
    if (!activeSocket) {
      return () => {};
    }

    const onConnect = () => {
      setSocketReady(true);
      setMatchNotice('');
    };

    const onConnectError = (error) => {
      console.error('Socket connection failed:', error);
      setSocketReady(false);
      setMatchNotice('Live matching is offline right now. You can still enter the community thread.');
    };

    const onMatchFound = ({ roomId: matchedRoomId, role, partnerUsername, partnerName }) => {
      setBookFriendOffered(false);
      setRoomId(matchedRoomId);
      setMatchRole(role || null);
      const normalizedPartner = String(partnerUsername || partnerName || '').trim();
      setPartnerDisplayName(normalizedPartner || 'Reader');
      setPhase('connected');
      activeSocket.emit('enter_conversation', { roomId: matchedRoomId });
      window.dispatchEvent(new Event('atlp-session-hint'));
    };

    const onAccessDenied = ({ message }) => {
      setMatchNotice(String(message || 'Live reading rooms are only available for open-access books.'));
    };

    const onMatchStats = (payload) => {
      if (payload && typeof payload === 'object') {
        setMatchStats({
          online: Number.isFinite(Number(payload.online)) ? Number(payload.online) : null,
          searching: Number.isFinite(Number(payload.searching)) ? Number(payload.searching) : null,
          updatedAt: payload.updatedAt || null,
        });
      }
    };

    const onReceiveMessage = ({ message }) => {
      setMessages((prev) => [...prev, { text: message, sender: 'partner', timestamp: new Date() }]);
    };

    const onPartnerLeft = ({ message } = {}) => {
      if (peerRef.current) {
        try { peerRef.current.close(); } catch { /* ignore */ }
        peerRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      pendingOfferRef.current = null;
      setMediaStatus('idle');
      setMediaError('');
      setMatchNotice(String(message || 'The other reader has left the discussion.'));
      setRoomId(null);
      setPartnerDisplayName('Reader');
      setMessages([]);
      setPhase('preferences');
      window.dispatchEvent(new Event('atlp-session-hint'));
    };

    const onWebRtcOffer = async ({ offer }) => {
      if (!offer) return;
      try {
        if (!localStreamRef.current) {
          pendingOfferRef.current = offer;
          if (typeof startCallRef.current === 'function') startCallRef.current();
          return;
        }
        const pc = peerRef.current;
        if (!pc) {
          pendingOfferRef.current = offer;
          return;
        }
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        activeSocket.emit('webrtc_answer', { roomId: roomIdRef.current, answer: pc.localDescription });
        setMediaStatus('connecting');
      } catch (error) {
        setMediaError(error?.message || 'Failed handling WebRTC offer.');
        setMediaStatus('failed');
      }
    };

    const onWebRtcAnswer = async ({ answer }) => {
      if (!answer) return;
      try {
        const pc = peerRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(answer);
        setMediaStatus('connecting');
      } catch (error) {
        setMediaError(error?.message || 'Failed handling WebRTC answer.');
        setMediaStatus('failed');
      }
    };

    const onWebRtcCandidate = async ({ candidate }) => {
      if (!candidate) return;
      try {
        const pc = peerRef.current;
        if (!pc) return;
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    };

    activeSocket.on('connect', onConnect);
    activeSocket.on('connect_error', onConnectError);
    activeSocket.on('match_found', onMatchFound);
    activeSocket.on('access_denied', onAccessDenied);
    activeSocket.on('match_stats', onMatchStats);
    activeSocket.on('receive_message', onReceiveMessage);
    activeSocket.on('partner_left', onPartnerLeft);
    activeSocket.on('webrtc_offer', onWebRtcOffer);
    activeSocket.on('webrtc_answer', onWebRtcAnswer);
    activeSocket.on('webrtc_ice_candidate', onWebRtcCandidate);

    setSocketReady(activeSocket.connected);

    return () => {
      activeSocket.off('connect', onConnect);
      activeSocket.off('connect_error', onConnectError);
      activeSocket.off('match_found', onMatchFound);
      activeSocket.off('access_denied', onAccessDenied);
      activeSocket.off('match_stats', onMatchStats);
      activeSocket.off('receive_message', onReceiveMessage);
      activeSocket.off('partner_left', onPartnerLeft);
      activeSocket.off('webrtc_offer', onWebRtcOffer);
      activeSocket.off('webrtc_answer', onWebRtcAnswer);
      activeSocket.off('webrtc_ice_candidate', onWebRtcCandidate);
    };
  }, [bookId, matchBookId, meetRoomState, navigate, parsedSourceRoute, isObjectId, socket]);

  useEffect(() => {
    setSocketReady(socketConnected);
  }, [socketConnected]);

  const sessionIsSensitive = phase === 'searching' || phase === 'connected' || phase === 'bookfriend';

  const closeBookFriendSession = useCallback(() => {
    if (!bookFriendSessionId) return;
    api.post('/agent/end', { session_id: bookFriendSessionId }).catch(() => {});
    setBookFriendSessionId(null);
  }, [bookFriendSessionId]);

  useEffect(() => () => {
    if (bookFriendSessionId) api.post('/agent/end', { session_id: bookFriendSessionId }).catch(() => {});
  }, [bookFriendSessionId]);

  const endSession = useCallback(async (reason = 'leave') => {
    if (cleanupInFlightRef.current) {
      return;
    }

    cleanupInFlightRef.current = true;

    try {
      if (phase === 'searching') {
        await api.post('/matchmaking/leave').catch(() => {});
      }

      if (phase === 'connected' && roomId) {
        socketRef.current?.emit('leave_room', { roomId, reason });
      }

      if (phase === 'bookfriend') {
        closeBookFriendSession();
      }

      await api.post('/session/end', { reason }).catch(() => {});
    } finally {
      cleanupInFlightRef.current = false;
    }
  }, [closeBookFriendSession, phase, roomId]);

  const navigationBlocker = useBlocker(sessionIsSensitive);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') {
      return;
    }
    setLeavePromptBody('You will disconnect from this reader.');
    pendingLeaveActionRef.current = () => navigationBlocker.proceed();
    setLeavePromptOpen(true);
  }, [navigationBlocker]);

  useEffect(() => {
    if (!socketReady) {
      return;
    }
    if (!getStoredToken()) {
      return;
    }

    api.get('/session/status')
      .then(({ data }) => {
        const state = data?.session?.state;
        if (state === 'SEARCHING' || state === 'MATCHED' || state === 'IN_CONVERSATION') {
          return api.post('/session/end', { reason: 'restore-reset' });
        }
        return null;
      })
      .catch(() => {})
      .finally(() => {
        api.post('/session/start', { state: 'IDLE', bookId }).catch(() => {});
      });
  }, [bookId, socketReady]);

  useEffect(() => {
    if (!sessionIsSensitive) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      try {
        const token = getStoredToken();
        if (token && navigator.sendBeacon) {
          const payload = JSON.stringify({ token, reason: 'beforeunload' });
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(`${getApiBaseUrl()}/session/end`, blob);
        }
      } catch {
        // ignore
      }

      event.preventDefault();
      event.returnValue = 'Leaving will end your current session.';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionIsSensitive]);

  useEffect(() => {
    if (!sessionIsSensitive && navigationBlocker.state === 'blocked') {
      navigationBlocker.reset();
    }
    if (typeof window !== 'undefined') lastSafeHashRef.current = window.location.hash;
  }, [navigationBlocker, sessionIsSensitive]);

	  const cleanupMedia = useCallback(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    if (peerRef.current) {
      try { peerRef.current.close(); } catch { /* ignore */ }
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }
    pendingOfferRef.current = null;
    setMediaStatus('idle');
    setMediaError('');
  }, []);

  const startCall = useCallback(async () => {
    if (prefType === 'text') return;
    try {
      setMediaStatus('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: prefType === 'video' });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerRef.current = pc;
      remoteStreamRef.current = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => event.streams[0].getTracks().forEach((track) => remoteStreamRef.current?.addTrack(track));
      pc.onicecandidate = (event) => {
        if (event.candidate) socketRef.current?.emit('webrtc_ice_candidate', { roomId: roomIdRef.current, candidate: event.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setMediaStatus('connected');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          cleanupMedia();
          setMediaStatus('failed');
        }
      };

      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(pendingOfferRef.current);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('webrtc_answer', { roomId: roomIdRef.current, answer: pc.localDescription });
        pendingOfferRef.current = null;
        setMediaStatus('connecting');
        return;
      }

      if (matchRole === 'initiator') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('webrtc_offer', { roomId: roomIdRef.current, offer: pc.localDescription });
      }
      setMediaStatus('ready');
    } catch (error) {
      setMediaError(error?.message || 'Unable to access camera or microphone.');
      setMediaStatus('failed');
    }
  }, [cleanupMedia, matchRole, prefType]);

  startCallRef.current = startCall;

  useEffect(() => {
    if (phase !== 'connected') cleanupMedia();
  }, [cleanupMedia, phase]);

  useEffect(() => () => {
    cleanupMedia();
  }, [cleanupMedia]);

  useEffect(() => {
    if (phase !== 'searching') return undefined;
    setSearchSeconds(0);
    setSearchingDots('.');
    setBookFriendOffered(false);

    if (searchIntervalRef.current) {
      window.clearInterval(searchIntervalRef.current);
    }

    searchIntervalRef.current = window.setInterval(() => {
      setSearchSeconds((prev) => prev + 1);
    }, 1000);

    setSearchHint(`Calling for readers who finished this book (${prefType}).`);
    const nudgeTimeoutId = window.setTimeout(() => setSearchHint('Scanning for someone in the same chapter-afterglow.'), 12000);
    const delayTimeoutId = window.setTimeout(() => setSearchHint('This is taking longer than usual. Hang tight.'), 32000);
    const bookFriendTimeoutId = window.setTimeout(() => {
      setBookFriendOffered(true);
      setSearchHint('No match yet. You can start a text chat with BookFriend while we keep looking.');
    }, 45000);
    return () => {
      window.clearTimeout(nudgeTimeoutId);
      window.clearTimeout(delayTimeoutId);
      window.clearTimeout(bookFriendTimeoutId);
      if (searchIntervalRef.current) {
        window.clearInterval(searchIntervalRef.current);
        searchIntervalRef.current = null;
      }
    };
  }, [phase, prefType]);

  useEffect(() => {
    if (phase !== 'searching') return undefined;
    const dotsInterval = window.setInterval(() => {
      setSearchingDots((prev) => (prev === '.' ? '..' : prev === '..' ? '...' : '.'));
    }, 420);
    return () => window.clearInterval(dotsInterval);
  }, [phase]);

  if (loading) return <div className="p-10 text-center mt-20 font-serif">Deep in the archives... Seeking your book.</div>;
  if (!book) return <div className="p-10 text-center mt-20 font-serif">Book not found. Perhaps it's still being written?</div>;

  const handleStartSearch = async () => {
    if (!socketRef.current?.connected) {
      setMatchNotice('Connecting to live matching…');
      try {
        await ensureConnected();
      } catch {
        setMatchNotice('Live matching is unavailable right now. Please try again shortly, or enter the community thread.');
        return;
      }
    }
    setPhase('searching');
    setMatchNotice('');
    const attemptJoin = async () => api.post('/meet/join', {
      source: book?.source,
      source_book_id: book?.sourceId,
      prefType,
    });

    await attemptJoin().then(() => {
      window.dispatchEvent(new Event('atlp-session-hint'));
    }).catch(async (error) => {
      const statusCode = Number(error?.response?.status || 0);
      const serverMessage = String(error?.response?.data?.message || error?.response?.data?.error || '').trim();
      const socketMismatch = statusCode === 409 && /no active socket connection/i.test(serverMessage);

      if (socketMismatch) {
        try {
          await ensureConnected({ forceReconnect: true });
          await attemptJoin();
          window.dispatchEvent(new Event('atlp-session-hint'));
          return;
        } catch {
          // Fall through to the generic message below.
        }
      }

      console.error('Failed to join matchmaking:', error);
      setMatchNotice(serverMessage || 'Unable to start matchmaking right now. Please try again.');
      setPhase('preferences');
    });
  };

  const handleCancelSearch = async () => {
    await api.post('/meet/leave').catch(() => {});
    setPhase('preferences');
    setSearchHint('');
    setSearchSeconds(0);
    setBookFriendOffered(false);
    window.dispatchEvent(new Event('atlp-session-hint'));
  };

  const handleTalkToBookFriend = async () => {
    log('Bookfriend clicked');
    setBookFriendLoading(true);
    setMatchNotice('');
    try {
      const inferredBookId = (
        String(book?.source || '').trim().toLowerCase() === 'gutenberg'
          ? (book?.sourceId || book?.gutenbergId || '')
          : (book?._id || book?.id || bookId)
      );
      const payload = {
        book_id: String(inferredBookId || '').trim(),
        book_title: book?.title || '',
        book_author: book?.author || '',
      };
      log('Payload:', payload);
      const { data } = await api.post('/agent/start', payload);
      setBookFriendSessionId(data.session_id);
      setMessages([]);
      setPhase('bookfriend');
    } catch (error) {
      setMatchNotice(error?.response?.data?.error || error?.response?.data?.message || 'BookFriend is unavailable right now. Please try again shortly.');
    } finally {
      setBookFriendLoading(false);
    }
  };

  const sendBookFriendMessage = async (event) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !bookFriendSessionId) return;
    setMessages((prev) => [...prev, { text: trimmed, sender: 'me', timestamp: new Date() }]);
    setChatInput('');
    try {
      const payload = { session_id: bookFriendSessionId, message: trimmed };
      log('Payload:', payload);
      const { data } = await api.post('/agent/message', payload);
      setMessages((prev) => [...prev, { text: data.response, sender: 'bookfriend', timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [...prev, { text: 'Sorry, I lost the thread for a moment. Could you try that again?', sender: 'bookfriend', timestamp: new Date() }]);
    }
  };

  const sendMessage = (event) => {
    if (event) event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !roomId || !socketRef.current) return;
    const msgData = { roomId, message: trimmed, senderId: socketRef.current.id };
    socketRef.current.emit('send_message', msgData);
    setMessages((prev) => [...prev, { text: trimmed, sender: 'me', timestamp: new Date() }]);
    setChatInput('');
  };

  const handleChatKeyDown = (event, submit) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const mediaConnected = mediaStatus === 'ready' || mediaStatus === 'connecting' || mediaStatus === 'connected';

  const searchStage = (() => {
    if (searchSeconds >= 60) return 'delayed';
    if (searchSeconds >= 32) return 'lingering';
    if (searchSeconds >= 12) return 'searching';
    return 'starting';
  })();

  const formattedPrefType = prefType === 'voice'
    ? 'Voice'
    : prefType === 'video'
      ? 'Video'
      : 'Text';

  return (
    <div className={`meeting-hub meeting-hub--${phase} animate-fade-in`}>
      {phase === 'preferences' && (
        <div className="preferences-container animate-fade-in">
          <div className="preferences-content glass-panel">
            <button
              type="button"
              className="meeting-back-btn"
              onClick={() => {
                try {
                  navigate(-1);
                } catch {
                  navigate('/meet');
                }
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back</span>
            </button>

            <h2 className="font-serif text-center mb-2">How would you like to connect?</h2>
            <p className="text-muted text-center mb-8">Select your preferred medium to discuss <em>{book.title}</em>. Your identity remains anonymous.</p>
            <div className="pref-options">
              <button type="button" className={`pref-card ${prefType === 'text' ? 'selected' : ''}`} onClick={() => { setPrefType('text'); setMatchNotice(''); }}><MessageSquare className="pref-icon" size={26} strokeWidth={2.1} /><h3>Text Chat</h3><p>Quiet, thoughtful discussion.</p></button>
              <button type="button" className={`pref-card ${prefType === 'voice' ? 'selected' : ''}`} onClick={() => { setPrefType('voice'); setMatchNotice(''); }}><Mic className="pref-icon" size={26} strokeWidth={2.1} /><h3>Voice Call</h3><p>Vocalize your thoughts securely.</p></button>
              <button type="button" className={`pref-card ${prefType === 'video' ? 'selected' : ''}`} onClick={() => { setPrefType('video'); setMatchNotice(''); }}><Video className="pref-icon" size={26} strokeWidth={2.1} /><h3>Video Call</h3><p>Face-to-face, masked connection.</p></button>
            </div>
            {matchNotice && <div className="meeting-notice" role="status">{matchNotice}</div>}
            <div className="mt-8 text-center flex-column-center gap-4">
              <button className="btn-primary" disabled={!prefType || !socketReady} onClick={handleStartSearch}>
                Find a reading partner <ArrowRight size={18} />
              </button>
                  {isObjectId ? (
                    <button className="btn-secondary" onClick={() => navigate(`/thread/${bookId}`)}>Skip to Community Thread instead</button>
                  ) : null}
                </div>
          </div>
        </div>
      )}

      {phase === 'searching' && (
        <div className="searching-container animate-fade-in">
          <div className="searching-card glass-panel">
            <div className="radar-animation" aria-hidden="true">
              <Waves size={22} className="radar-center-icon" />
            </div>

            <div className="searching-header">
              <h2 className="font-serif searching-title">
                {searchStage === 'starting' && 'Finding a reader'}
                {searchStage === 'searching' && 'Matching you'}
                {searchStage === 'lingering' && 'Almost there'}
                {searchStage === 'delayed' && 'Taking longer than usual'}
                <span className="searching-dots" aria-hidden="true">{searchingDots}</span>
              </h2>
              <p className="text-muted searching-subtitle">
                {searchHint}
              </p>
            </div>

            <div className="searching-meta" aria-label="Live activity">
              <span className="searching-pill">
                <Clock3 size={14} aria-hidden="true" /> {Math.max(0, searchSeconds)}s
              </span>
              <span className="searching-pill">
                {formattedPrefType} matchmaking
              </span>
              <span className="searching-pill">
                {matchStats?.online != null
                  ? `${matchStats.online} online`
                  : (socketReady ? 'Live online' : 'Offline')}
              </span>
              {matchStats?.searching != null && (
                <span className="searching-pill">{matchStats.searching} searching</span>
              )}
            </div>

            <div className="searching-actions">
              {bookFriendOffered && (
                <button className="btn-secondary" disabled={bookFriendLoading} onClick={handleTalkToBookFriend}>
                  {bookFriendLoading ? 'Starting BookFriend...' : 'Talk to BookFriend'}
                </button>
              )}
              {searchStage === 'delayed' ? (
                <button className="btn-secondary sm" onClick={handleCancelSearch}>
                  Try again
                </button>
              ) : (
                <button className="btn-secondary sm" onClick={handleCancelSearch}>
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'bookfriend' && (
        <div className="room-container animate-fade-in">
          <header className="room-header glass-panel">
            <div className="partner-info">
              <div className="wizard-avatar" aria-hidden="true">
                <Bot size={18} />
              </div>
              <div className="partner-copy">
                <div className="room-title font-serif">BookFriend</div>
                <div className="room-subtitle text-muted">A quiet companion for this book.</div>
              </div>
            </div>
            <div className="room-actions">
              <button
                type="button"
                className="btn-secondary sm"
                onClick={() => {
                  closeBookFriendSession();
                  setMessages([]);
                  setChatInput('');
                  setPhase('preferences');
                }}
              >
                Leave
              </button>
            </div>
          </header>

          <section className="room-main glass-panel">
            <div className="chat-interface">
              <div className="chat-messages" aria-label="Chat messages">
                {messages.map((m, i) => (
                  <div key={`${m.sender}-${i}`} className={`message ${m.sender === 'me' ? 'sent' : ''}`}>
                    <div className="msg-bubble">{m.text}</div>
                  </div>
                ))}
              </div>
              <form className="chat-input-area" onSubmit={sendBookFriendMessage}>
                <textarea
                  className="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(event) => handleChatKeyDown(event, () => sendBookFriendMessage(event))}
                  placeholder="Share your thought..."
                  rows={1}
                />
                <button type="submit" className="send-btn" aria-label="Send" disabled={!chatInput.trim()}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      {phase === 'connected' && (
        <div className="room-container animate-fade-in">
          <header className="room-header glass-panel">
            <div className="partner-info">
              <div className="partner-avatar" aria-hidden="true">
                <User size={18} />
              </div>
              <div className="partner-copy">
                <div className="room-title font-serif">{partnerDisplayName || 'Reader'}</div>
              </div>
            </div>

            <div className="room-actions">
              <button
                type="button"
                className="btn-leave sm"
                onClick={() => {
                  setLeavePromptBody('You will disconnect from this reader.');
                  pendingLeaveActionRef.current = () => {
                    setRoomId(null);
                    setMessages([]);
                    setPhase('preferences');
                  };
                  setLeavePromptOpen(true);
                }}
              >
                <LogOut size={15} aria-hidden="true" />
                Leave
              </button>
            </div>
          </header>

          <section className="room-main glass-panel">
            {prefType !== 'text' && (
              <div className="media-stage" aria-label="Call area">
                {prefType === 'video' && (
                  <div className="video-grid">
                    <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
                    <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
                  </div>
                )}
                {prefType === 'voice' && <audio ref={remoteAudioRef} autoPlay />}

                {!mediaConnected && (
                  <div className="media-actions">
                    <button className="btn-primary sm" onClick={startCall} type="button">
                      Start call
                    </button>
                  </div>
                )}
                {mediaError && <p className="text-error text-xs media-error">{mediaError}</p>}
              </div>
            )}

            <div className="chat-interface">
              <div className="chat-messages" aria-label="Chat messages">
                {messages.map((m, i) => (
                  <div key={`${m.sender}-${i}`} className={`message ${m.sender === 'me' ? 'sent' : ''}`}>
                    <div className="msg-bubble">{m.text}</div>
                  </div>
                ))}
              </div>
              <form className="chat-input-area" onSubmit={sendMessage}>
                <textarea
                  className="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(event) => handleChatKeyDown(event, sendMessage)}
                  placeholder="Send a message..."
                  rows={1}
                />
                <button type="submit" className="send-btn" aria-label="Send" disabled={!chatInput.trim()}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      {leavePromptOpen && (
        <div className="leave-guard-overlay" role="dialog" aria-modal="true" aria-label="Leave session confirmation">
          <div className="leave-guard-card glass-panel">
            <h2 className="font-serif">Leave discussion?</h2>
            <p>{leavePromptBody}</p>
            <div className="leave-guard-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setLeavePromptOpen(false);
                  pendingLeaveActionRef.current = null;
                  if (navigationBlocker.state === 'blocked') {
                    navigationBlocker.reset();
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const proceed = pendingLeaveActionRef.current;
                  setLeavePromptOpen(false);
                  pendingLeaveActionRef.current = null;
                  endSession('guard-leave').finally(() => {
                    proceed?.();
                  });
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingHub;
