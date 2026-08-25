import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Modal, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { StatusBar } from 'expo-status-bar';

const EMOJI_CHOICES = ['😀', '😎', '🚀', '🌙', '🐺', '🦊', '🎮', '🎵', '🐼', '⭐', '🔥', '🌊'];

export default function App() {
  // ---- auth / connection state ----
  const [screen, setScreen] = useState('setup'); // setup | otp | profile | home | chat | calls | profile-tab
  const [tab, setTab] = useState('chats');
  const BACKEND_URL = 'https://hole-backend.onrender.com';
  const [backendUrl, setBackendUrl] = useState(BACKEND_URL);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emoji, setEmoji] = useState('😀');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);
  const [connected, setConnected] = useState(false);

  // ---- chat state ----
  const [conversations, setConversations] = useState({}); // { [peerId]: {id,name,emoji,online,messages:[]} }
  const [activeChatId, setActiveChatId] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [peekingId, setPeekingId] = useState(null);

  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const scrollRef = useRef(null);

  // ---- restore session on launch ----
  useEffect(() => {
    (async () => {
      const savedUrl = await AsyncStorage.getItem('hole:backendUrl');
      const savedToken = await AsyncStorage.getItem('hole:token');
      const savedMe = await AsyncStorage.getItem('hole:me');
      if (savedUrl) setBackendUrl(savedUrl);
      if (savedUrl && savedToken && savedMe) {
        const meObj = JSON.parse(savedMe);
        setToken(savedToken);
        setMe(meObj);
        setScreen('home');
        connectSocket(savedUrl, savedToken, meObj);
      }
    })();
    return () => { socketRef.current?.disconnect(); };
  }, []);

  // ---- expiry tick: mark messages "expiring" slightly before server removes them ----
  useEffect(() => {
    const t = setInterval(() => {
      setConversations((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          const c = next[k];
          const msgs = c.messages.map((m) => {
            if (m.expiresAt && !m.expiring && new Date(m.expiresAt).getTime() <= Date.now()) {
              changed = true;
              return { ...m, expiring: true };
            }
            return m;
          });
          next[k] = { ...c, messages: msgs };
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  // ================= API helper =================
  const api = useCallback((path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(backendUrl.replace(/\/$/, '') + path, { ...opts, headers }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
  }, [backendUrl, token]);

  // ================= auth flow =================
  async function requestOtp() {
    setErr(''); setBusy(true);
    try {
      if (!backendUrl || !phone) throw new Error('Backend URL and phone are required');
      await fetch(backendUrl.replace(/\/$/, '') + '/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || 'Failed'); });
      setScreen('otp');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function verifyAndContinue() {
    setErr(''); setBusy(true);
    try {
      if (!code) throw new Error('Enter the code');
      const r = await fetch(backendUrl.replace(/\/$/, '') + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      if (r.ok) {
        const data = await r.json();
        await finishAuth(data);
      } else {
        setScreen('profile'); // no account yet -> collect profile
      }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function completeRegistration() {
    setErr(''); setBusy(true);
    try {
      if (!username || !displayName) throw new Error('Username and display name are required');
      const r = await fetch(backendUrl.replace(/\/$/, '') + '/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, username, displayName, emoji }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Registration failed');
      await finishAuth(data);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function finishAuth({ token: tok, user }) {
    setToken(tok); setMe(user); setScreen('home'); setTab('chats');
    await AsyncStorage.setItem('hole:backendUrl', backendUrl);
    await AsyncStorage.setItem('hole:token', tok);
    await AsyncStorage.setItem('hole:me', JSON.stringify(user));
    connectSocket(backendUrl, tok, user);
  }

  async function leaveHole() {
    socketRef.current?.disconnect();
    await AsyncStorage.multiRemove(['hole:token', 'hole:me']);
    setToken(null); setMe(null); setConversations({});
    setScreen('setup'); setPhone(''); setCode(''); setUsername(''); setDisplayName('');
  }

  // ================= socket =================
  function connectSocket(url, tok, meUser) {
    const socket = io(url, { auth: { token: tok }, transports: ['websocket'] });
    socketRef.current = socket;
    const myId = meUser?._id || meUser?.id;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('message:new', (msg) => {
      if (msg.senderId === myId) return; // echo of our own message on another device
      setConversations((prev) => {
        const existing = prev[msg.senderId] || { id: msg.senderId, name: 'Unknown', emoji: '❓', online: false, messages: [] };
        return {
          ...prev,
          [msg.senderId]: {
            ...existing,
            messages: [...existing.messages, { id: msg.id, from: 'them', text: msg.text, createdAt: msg.createdAt, expiresAt: null, expiring: false, opened: false }],
          },
        };
      });
      // resolve profile for unknown senders
      api('/users/' + msg.senderId).then(({ user }) => {
        setConversations((prev) => {
          const c = prev[msg.senderId];
          if (!c) return prev;
          return { ...prev, [msg.senderId]: { ...c, name: user.displayName, emoji: user.emoji } };
        });
      }).catch(() => {});
    });

    socket.on('message:opened', ({ messageId, expiresAt }) => {
      setConversations((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], messages: next[k].messages.map((m) => (m.id === messageId ? { ...m, opened: true, expiresAt } : m)) };
        });
        return next;
      });
    });

    socket.on('message:expired', ({ messageId }) => {
      setConversations((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], messages: next[k].messages.filter((m) => m.id !== messageId) };
        });
        return next;
      });
    });

    socket.on('typing:start', ({ fromUserId }) => {
      setActiveChatId((current) => { if (current === fromUserId) setPeerTyping(true); return current; });
    });
    socket.on('typing:stop', ({ fromUserId }) => {
      setActiveChatId((current) => { if (current === fromUserId) setPeerTyping(false); return current; });
    });

    socket.on('presence:update', ({ userId, online }) => {
      setConversations((prev) => (prev[userId] ? { ...prev, [userId]: { ...prev[userId], online } } : prev));
    });
  }

  // ================= chat actions =================
  function openChat(peerId) {
    setScreen('chat'); setActiveChatId(peerId); setDraftText(''); setPeerTyping(false);
    const conv = conversations[peerId];
    const unopened = (conv?.messages || []).filter((m) => m.from === 'them' && !m.opened);
    unopened.forEach((m) => {
      socketRef.current.emit('message:open', { messageId: m.id }, (res) => {
        if (res?.expiresAt) {
          setConversations((prev) => {
            const c = prev[peerId]; if (!c) return prev;
            return { ...prev, [peerId]: { ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, opened: true, expiresAt: res.expiresAt } : x)) } };
          });
        }
      });
    });
  }

  function goHome() { setScreen('home'); setTab('chats'); setActiveChatId(null); }
  function setTabScreen(t) { setTab(t); setScreen(t === 'chats' ? 'home' : t === 'profile' ? 'profile-tab' : t); }

  function onDraftChange(text) {
    setDraftText(text);
    if (!activeChatId) return;
    socketRef.current.emit('typing:start', { toUserId: activeChatId });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socketRef.current.emit('typing:stop', { toUserId: activeChatId }), 1200);
  }

  function sendMessage() {
    const text = draftText.trim();
    if (!text || !activeChatId) return;
    const toUserId = activeChatId;
    socketRef.current.emit('message:send', { toUserId, text }, (res) => {
      if (res?.message) {
        setConversations((prev) => {
          const c = prev[toUserId] || { id: toUserId, name: 'Unknown', emoji: '❓', online: false, messages: [] };
          return { ...prev, [toUserId]: { ...c, messages: [...c.messages, { id: res.message.id, from: 'me', text, createdAt: res.message.createdAt, expiresAt: null, expiring: false, opened: false }] } };
        });
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      }
    });
    setDraftText('');
  }

  function peekTimer(messageId) {
    setPeekingId(messageId);
    setTimeout(() => setPeekingId((cur) => (cur === messageId ? null : cur)), 1800);
  }

  // ================= new chat / search =================
  function toggleNewChat(v) { setShowNewChat(v); setSearchQuery(''); setSearchResults([]); }
  function onSearchChange(text) {
    setSearchQuery(text);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      if (!text.trim()) { setSearchResults([]); return; }
      try {
        const { results } = await api('/users/search?q=' + encodeURIComponent(text.trim()));
        setSearchResults(results);
      } catch (e) { /* ignore */ }
    }, 300);
  }
  function startChatWith(user) {
    const id = user._id || user.id;
    setConversations((prev) => (prev[id] ? prev : { ...prev, [id]: { id, name: user.displayName, emoji: user.emoji, online: false, messages: [] } }));
    setShowNewChat(false);
    setScreen('chat'); setActiveChatId(id); setDraftText('');
  }

  // ================= derived data =================
  const sortedConvs = Object.values(conversations).sort((a, b) => {
    const at = a.messages.length ? new Date(a.messages[a.messages.length - 1].createdAt).getTime() : 0;
    const bt = b.messages.length ? new Date(b.messages[b.messages.length - 1].createdAt).getTime() : 0;
    return bt - at;
  });
  const activeConv = activeChatId ? conversations[activeChatId] : null;

  function relTime(ts) {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    return Math.floor(diff / 3600) + 'h';
  }

  // ================= render =================
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {screen === 'setup' && (
        <View style={styles.auth}>
          <View style={styles.breatheDot} />
          <Text style={styles.wordmark}>H<Text style={styles.ringChar}>◯</Text>LE</Text>
          <Text style={styles.sub}>Connect to your deployed backend to start a real session.</Text>
          <Text style={styles.label}>Backend URL</Text>
          <TextInput style={styles.field} placeholder="https://your-app.up.railway.app" placeholderTextColor="#8E8E93"
            autoCapitalize="none" autoCorrect={false} value={backendUrl} onChangeText={setBackendUrl} />
          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.field} placeholder="+1 555 000 0000" placeholderTextColor="#8E8E93"
            keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          {!!err && <Text style={styles.err}>{err}</Text>}
          <TouchableOpacity style={[styles.btnPrimary, busy && styles.disabled]} disabled={busy} onPress={requestOtp}>
            <Text style={styles.btnPrimaryText}>{busy ? 'Sending…' : 'Send code'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>OTP is mocked on the server — the code is always 123456.</Text>
        </View>
      )}

      {screen === 'otp' && (
        <View style={styles.auth}>
          <Text style={styles.wordmark}>H<Text style={styles.ringChar}>◯</Text>LE</Text>
          <Text style={styles.sub}>Enter the code sent to {phone}</Text>
          <Text style={styles.label}>Verification code</Text>
          <TextInput style={styles.field} placeholder="123456" placeholderTextColor="#8E8E93"
            keyboardType="number-pad" value={code} onChangeText={setCode} />
          {!!err && <Text style={styles.err}>{err}</Text>}
          <TouchableOpacity style={[styles.btnPrimary, busy && styles.disabled]} disabled={busy} onPress={verifyAndContinue}>
            <Text style={styles.btnPrimaryText}>{busy ? 'Checking…' : 'Continue'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={() => setScreen('setup')}>
            <Text style={styles.btnGhostText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'profile' && (
        <ScrollView contentContainerStyle={styles.auth}>
          <Text style={styles.wordmark}>H<Text style={styles.ringChar}>◯</Text>LE</Text>
          <Text style={styles.sub}>New account — choose your identity</Text>
          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.field} placeholder="eric" placeholderTextColor="#8E8E93"
            autoCapitalize="none" value={username} onChangeText={setUsername} />
          <Text style={styles.label}>Display name</Text>
          <TextInput style={styles.field} placeholder="Eric" placeholderTextColor="#8E8E93"
            value={displayName} onChangeText={setDisplayName} />
          <Text style={styles.label}>Icon</Text>
          <View style={styles.emojiRow}>
            {EMOJI_CHOICES.map((e) => (
              <TouchableOpacity key={e} style={[styles.emojiChoice, emoji === e && styles.emojiChoiceSel]} onPress={() => setEmoji(e)}>
                <Text style={{ fontSize: 18 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!err && <Text style={styles.err}>{err}</Text>}
          <TouchableOpacity style={[styles.btnPrimary, busy && styles.disabled]} disabled={busy} onPress={completeRegistration}>
            <Text style={styles.btnPrimaryText}>{busy ? 'Creating…' : 'Enter the Hole'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {screen === 'home' && (
        <View style={styles.screen}>
          <View style={styles.topbar}>
            <Text style={styles.title}>H<Text style={styles.ringChar}>◯</Text>LE</Text>
            <View style={[styles.connDot, !connected && styles.connDotOff]} />
          </View>
          <View style={styles.searchBar}><Text style={styles.searchPlaceholder}>🔍 Search</Text></View>

          {sortedConvs.length === 0 ? (
            <View style={styles.emptyHole}>
              <View style={styles.emptyDot} />
              <Text style={styles.emptyText}>Nothing here.</Text>
            </View>
          ) : (
            <FlatList
              data={sortedConvs}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 90 }}
              renderItem={({ item }) => {
                const last = item.messages[item.messages.length - 1];
                return (
                  <TouchableOpacity style={styles.conv} onPress={() => openChat(item.id)}>
                    <View style={styles.avatarWrap}>
                      <Text style={styles.avatarText}>{item.emoji}</Text>
                      {item.online && <View style={styles.onlineDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.convRow1}>
                        <Text style={styles.convName}>{item.name}</Text>
                        <Text style={styles.convTime}>{last ? relTime(last.createdAt) : ''}</Text>
                      </View>
                      <Text style={styles.convPreview} numberOfLines={1}>
                        {last ? (last.from === 'me' ? 'You: ' : '') + last.text : 'No messages'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.fab} onPress={() => toggleNewChat(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'chat' && activeConv && (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <View style={styles.chatTop}>
            <TouchableOpacity onPress={goHome}><Text style={styles.back}>←</Text></TouchableOpacity>
            <View style={styles.chatAvatar}><Text>{activeConv.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatName}>{activeConv.name}</Text>
              <Text style={styles.chatStatus}>{activeConv.online ? '🟢 Online' : '⚫ Offline'}</Text>
            </View>
          </View>

          <ScrollView ref={scrollRef} style={styles.msgs} contentContainerStyle={{ padding: 14 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            <Text style={styles.systemNote}>Messages disappear a fixed time after opening — enforced by the server.</Text>
            {activeConv.messages.map((m) => (
              <View key={m.id} style={[styles.msgRow, m.from === 'me' ? styles.msgRowMe : styles.msgRowThem]}>
                <Pressable
                  onPress={() => peekTimer(m.id)}
                  style={[
                    styles.bubble,
                    m.from === 'me' ? styles.bubbleMe : styles.bubbleThem,
                    m.expiring && styles.bubbleExpiring,
                  ]}
                >
                  <Text style={m.from === 'me' ? styles.bubbleTextMe : styles.bubbleTextThem}>{m.text}</Text>
                  {peekingId === m.id && m.expiresAt && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {Math.max(0, Math.round((new Date(m.expiresAt).getTime() - Date.now()) / 1000))}s
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ))}
            {activeConv.messages.length === 0 && <Text style={styles.systemNote}>Say something.</Text>}
          </ScrollView>

          {peerTyping && (
            <View style={styles.rippleRow}>
              <View style={styles.rippleDot} />
              <Text style={styles.rippleLabel}>{activeConv.name} is typing…</Text>
            </View>
          )}

          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Type a message…"
              placeholderTextColor="#8E8E93"
              value={draftText}
              onChangeText={onDraftChange}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Text style={{ color: '#fff', fontSize: 15 }}>➤</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {screen === 'calls' && (
        <View style={styles.screen}>
          <View style={styles.topbar}><Text style={styles.title}>Calls</Text></View>
          <View style={styles.centerScreen}>
            <Text style={styles.callsMsg}>Not wired up yet — calling needs WebRTC signaling on top of this socket layer.</Text>
          </View>
        </View>
      )}

      {screen === 'profile-tab' && (
        <View style={styles.screen}>
          <View style={styles.topbar}><Text style={styles.title}>Profile</Text></View>
          <View style={styles.centerScreen}>
            <View style={styles.profileEmoji}><Text style={{ fontSize: 32 }}>{me?.emoji || '😊'}</Text></View>
            <Text style={styles.profileName}>{me?.displayName || ''}</Text>
            <Text style={styles.profileHandle}>@{me?.username || ''}</Text>
            <TouchableOpacity style={styles.leaveBtn} onPress={leaveHole}>
              <Text style={{ color: '#fff', fontSize: 13 }}>Leave the Hole</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!['setup', 'otp', 'profile', 'chat'].includes(screen) && (
        <View style={styles.navbar}>
          {[
            { key: 'chats', label: 'Chats', ico: '💬' },
            { key: 'calls', label: 'Calls', ico: '📞' },
            { key: 'profile', label: 'Profile', ico: me?.emoji || '😊' },
          ].map((it) => (
            <TouchableOpacity key={it.key} style={styles.navBtn} onPress={() => setTabScreen(it.key)}>
              <Text style={{ fontSize: 16, opacity: tab === it.key ? 1 : 0.5 }}>{it.ico}</Text>
              <Text style={[styles.navLabel, tab === it.key && styles.navLabelActive]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={showNewChat} transparent animationType="slide" onRequestClose={() => toggleNewChat(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => toggleNewChat(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Find someone</Text>
            <TextInput
              style={styles.field}
              placeholder="Search @username"
              placeholderTextColor="#8E8E93"
              autoCapitalize="none"
              value={searchQuery}
              onChangeText={onSearchChange}
            />
            <ScrollView style={{ maxHeight: 260, marginTop: 8 }}>
              {searchResults.map((u) => (
                <TouchableOpacity key={u._id || u.id} style={styles.contactRow} onPress={() => startChatWith(u)}>
                  <View style={styles.contactAvatar}><Text>{u.emoji}</Text></View>
                  <Text style={{ color: '#fff' }}>{u.displayName} <Text style={{ color: '#8E8E93', fontSize: 12 }}>@{u.username}</Text></Text>
                </TouchableOpacity>
              ))}
              {!!searchQuery && searchResults.length === 0 && <Text style={styles.hint}>No user found.</Text>}
            </ScrollView>
            <TouchableOpacity onPress={() => toggleNewChat(false)}>
              <Text style={[styles.hint, { marginTop: 14 }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const BG = '#000000';
const SURFACE = '#0A0A0A';
const HAIR = 'rgba(255,255,255,0.08)';
const WHITE = '#FFFFFF';
const ACCENT = '#007AFF';
const SUB = '#8E8E93';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  screen: { flex: 1 },

  auth: { flexGrow: 1, padding: 26, paddingTop: 48, gap: 10 },
  breatheDot: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 8 },
  wordmark: { color: WHITE, fontSize: 22, fontWeight: '500', textAlign: 'center', marginBottom: 4 },
  ringChar: { color: WHITE },
  sub: { color: SUB, fontSize: 12.5, textAlign: 'center', marginBottom: 6, lineHeight: 18 },
  label: { color: SUB, fontSize: 11, marginTop: 6, marginBottom: 2, marginLeft: 2 },
  field: { backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, borderRadius: 12, padding: 12, color: WHITE, fontSize: 14 },
  err: { color: '#FF453A', fontSize: 12, textAlign: 'center', minHeight: 16, marginTop: 4 },
  btnPrimary: { marginTop: 10, backgroundColor: WHITE, borderRadius: 14, padding: 13, alignItems: 'center' },
  btnPrimaryText: { color: '#000', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  btnGhost: { borderWidth: 1, borderColor: HAIR, borderRadius: 14, padding: 11, alignItems: 'center', marginTop: 6 },
  btnGhostText: { color: SUB, fontSize: 13 },
  hint: { color: SUB, fontSize: 11, textAlign: 'center', marginTop: 6 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  emojiChoice: { width: 38, height: 38, borderRadius: 10, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center' },
  emojiChoiceSel: { borderColor: ACCENT },

  topbar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: WHITE, fontSize: 19, fontWeight: '500' },
  connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#30D158' },
  connDotOff: { backgroundColor: '#FF453A' },

  searchBar: { marginHorizontal: 20, marginBottom: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, borderRadius: 14, padding: 10 },
  searchPlaceholder: { color: SUB, fontSize: 13 },

  emptyHole: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 60 },
  emptyDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  emptyText: { color: SUB, fontSize: 13 },

  conv: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16 },
  avatarWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20 },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#30D158', borderWidth: 2, borderColor: BG },
  convRow1: { flexDirection: 'row', justifyContent: 'space-between' },
  convName: { color: WHITE, fontSize: 14.5, fontWeight: '500' },
  convTime: { color: SUB, fontSize: 11 },
  convPreview: { color: SUB, fontSize: 12.5, marginTop: 2 },

  fab: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  fabText: { fontSize: 22, color: '#000' },

  navbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 8 },
  navBtn: { flex: 1, alignItems: 'center', paddingBottom: 16, gap: 4 },
  navLabel: { color: SUB, fontSize: 10.5 },
  navLabelActive: { color: WHITE },

  chatTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: HAIR },
  back: { color: WHITE, fontSize: 20, width: 24 },
  chatAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center' },
  chatName: { color: WHITE, fontSize: 14, fontWeight: '500' },
  chatStatus: { color: SUB, fontSize: 11 },

  msgs: { flex: 1 },
  systemNote: { color: SUB, fontSize: 11, textAlign: 'center', marginBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 8 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '74%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, position: 'relative' },
  bubbleThem: { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: HAIR },
  bubbleMe: { backgroundColor: ACCENT },
  bubbleExpiring: { opacity: 0.2, transform: [{ scale: 0.6 }] },
  bubbleTextThem: { color: WHITE, fontSize: 14 },
  bubbleTextMe: { color: WHITE, fontSize: 14 },
  badge: { position: 'absolute', top: -10, right: -6, backgroundColor: '#000', borderWidth: 1, borderColor: HAIR, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: WHITE, fontSize: 10 },

  rippleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 6 },
  rippleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  rippleLabel: { color: SUB, fontSize: 11 },

  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: HAIR },
  composerInput: { flex: 1, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: WHITE, fontSize: 14 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },

  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 30 },
  callsMsg: { color: SUB, fontSize: 13, textAlign: 'center' },
  profileEmoji: { width: 74, height: 74, borderRadius: 37, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  profileName: { color: WHITE, fontSize: 16, fontWeight: '500' },
  profileHandle: { color: SUB, fontSize: 13, marginBottom: 20 },
  leaveBtn: { marginTop: 24, borderWidth: 1, borderColor: HAIR, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: BG, borderTopWidth: 1, borderTopColor: HAIR, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 32, maxHeight: '75%' },
  modalTitle: { color: WHITE, fontSize: 15, fontWeight: '500', marginBottom: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: HAIR },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center' },
});
