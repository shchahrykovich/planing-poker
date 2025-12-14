import { useEffect, useRef, useState, useCallback } from 'react';

export interface User {
  id: string;
  name: string;
  hasVoted: boolean;
}

export type ServerMessage =
  | { type: 'joined'; userId: string; name: string }
  | { type: 'userJoined'; userId: string; name: string }
  | { type: 'userLeft'; userId: string }
  | { type: 'voted'; userId: string; hasVoted: boolean }
  | { type: 'revealed'; votes: Record<string, string | null> }
  | { type: 'reset' }
  | { type: 'state'; users: User[]; revealed: boolean; votes?: Record<string, string | null> }
  | { type: 'emoji'; fromUserId: string; toUserId: string; emoji: string }
  | { type: 'error'; message: string };

export interface UseWebSocketReturn {
  users: User[];
  myUserId: string | null;
  revealed: boolean;
  votes: Record<string, string | null>;
  connected: boolean;
  error: string | null;
  sendVote: (card: string | null) => void;
  sendReveal: () => void;
  sendReset: () => void;
  sendEmoji: (targetUserId: string, emoji: string) => void;
  onEmojiReceived: (callback: (fromUserId: string, toUserId: string, emoji: string) => void) => void;
}

export function useWebSocket(roomId: string, userName: string): UseWebSocketReturn {
  const [users, setUsers] = useState<User[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [votes, setVotes] = useState<Record<string, string | null>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emojiCallbackRef = useRef<((fromUserId: string, toUserId: string, emoji: string) => void) | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/room/${roomId}/websocket`);

    ws.onopen = () => {
      setConnected(true);
      setError(null);

      // Join the room
      ws.send(JSON.stringify({
        type: 'join',
        name: userName
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      switch (message.type) {
        case 'joined':
          setMyUserId(message.userId);
          break;

        case 'state':
          setUsers(message.users);
          setRevealed(message.revealed);
          if (message.votes) {
            setVotes(message.votes);
          }
          break;

        case 'userJoined':
          setUsers(prev => [...prev, {
            id: message.userId,
            name: message.name,
            hasVoted: false
          }]);
          break;

        case 'userLeft':
          setUsers(prev => prev.filter(u => u.id !== message.userId));
          setVotes(prev => {
            const newVotes = { ...prev };
            delete newVotes[message.userId];
            return newVotes;
          });
          break;

        case 'voted':
          setUsers(prev => prev.map(u =>
            u.id === message.userId
              ? { ...u, hasVoted: message.hasVoted }
              : u
          ));
          break;

        case 'revealed':
          setRevealed(true);
          setVotes(message.votes);
          break;

        case 'reset':
          setRevealed(false);
          setVotes({});
          setUsers(prev => prev.map(u => ({ ...u, hasVoted: false })));
          break;

        case 'emoji':
          if (emojiCallbackRef.current) {
            emojiCallbackRef.current(message.fromUserId, message.toUserId, message.emoji);
          }
          break;

        case 'error':
          setError(message.message);
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket error occurred');
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    wsRef.current = ws;
  }, [roomId, userName]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendVote = useCallback((card: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'vote',
        card
      }));
    }
  }, []);

  const sendReveal = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'reveal'
      }));
    }
  }, []);

  const sendReset = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'reset'
      }));
    }
  }, []);

  const sendEmoji = useCallback((targetUserId: string, emoji: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'emoji',
        targetUserId,
        emoji
      }));
    }
  }, []);

  const onEmojiReceived = useCallback((callback: (fromUserId: string, toUserId: string, emoji: string) => void) => {
    emojiCallbackRef.current = callback;
  }, []);

  return {
    users,
    myUserId,
    revealed,
    votes,
    connected,
    error,
    sendVote,
    sendReveal,
    sendReset,
    sendEmoji,
    onEmojiReceived
  };
}
