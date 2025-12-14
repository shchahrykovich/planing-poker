import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { UserCard } from './UserCard';
import { VotingCard } from './VotingCard';
import { FlyingEmoji, type FlyingEmojiData } from './FlyingEmoji';
import './PlanningPoker.css';

const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

interface PlanningPokerProps {
  roomId: string;
  userName: string;
}

export function PlanningPoker({ roomId, userName }: PlanningPokerProps) {
  const {
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
  } = useWebSocket(roomId, userName);

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState<FlyingEmojiData[]>([]);

  // Handle received emojis from other users
  useEffect(() => {
    onEmojiReceived((_fromUserId: string, toUserId: string, emoji: string) => {
      const toElement = document.querySelector(`[data-user-id="${toUserId}"] .user-name`);

      if (toElement) {
        const toRect = toElement.getBoundingClientRect();

        // Randomly choose left or right edge
        const fromLeft = Math.random() > 0.5;
        const fromX = fromLeft ? -50 : window.innerWidth + 50;
        const fromY = Math.random() * window.innerHeight;

        const flyingEmoji: FlyingEmojiData = {
          id: `${Date.now()}-${Math.random()}`,
          emoji,
          fromX,
          fromY,
          toX: toRect.left + toRect.width / 2,
          toY: toRect.top + toRect.height / 2,
        };

        setFlyingEmojis(prev => [...prev, flyingEmoji]);
      }
    });
  }, [onEmojiReceived]);

  // Reset selected card when a new round starts
  useEffect(() => {
    if (!revealed && votes && Object.keys(votes).length === 0) {
      setSelectedCard(null);
    }
  }, [revealed, votes]);

  const roomUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    return url.toString();
  }, [roomId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCardClick = (value: string) => {
    const newValue = selectedCard === value ? null : value;
    setSelectedCard(newValue);
    sendVote(newValue);
  };

  const myUser = users.find(u => u.id === myUserId);
  const otherUsers = users.filter(u => u.id !== myUserId);

  const handleEmojiSend = useCallback((targetUserId: string, emoji: string) => {
    // Only send to server, don't create local animation
    // The animation will be triggered when we receive the broadcast from server
    sendEmoji(targetUserId, emoji);
  }, [sendEmoji]);

  const handleEmojiComplete = useCallback((id: string) => {
    setFlyingEmojis(prev => prev.filter(e => e.id !== id));
  }, []);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!revealed) return null;

    const numericVotes = Object.values(votes)
      .filter((v): v is string => v !== null && v !== '?' && v !== '☕' && !isNaN(Number(v)))
      .map(Number);

    if (numericVotes.length === 0) return null;

    const average = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;

    // Calculate vote distribution
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach(vote => {
      if (vote !== null) {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
      }
    });

    // Simple agreement indicator: if most votes are within 1 step of each other
    const sorted = [...numericVotes].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    const hasAgreement = range <= 3; // Consider it agreement if range is small

    return {
      average: average.toFixed(1),
      hasAgreement,
      voteCounts
    };
  }, [revealed, votes]);

  const handleReveal = () => {
    sendReveal();
  };

  const handleReset = () => {
    setSelectedCard(null);
    sendReset();
  };

  if (error) {
    return (
      <div className="planning-poker error">
        <div className="error-message">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="planning-poker loading">
        <div className="spinner"></div>
        <p>Connecting to room...</p>
      </div>
    );
  }

  return (
    <div className="planning-poker">
      <div className="room-header">
        <h2>Planning Poker</h2>
        <div className="room-info">
          <span className="room-id">Room: {roomId.slice(0, 8)}...</span>
          <button
            className={`copy-link-btn ${copySuccess ? 'copied' : ''}`}
            onClick={handleCopyLink}
            title="Copy room link"
          >
            {copySuccess ? 'Copied' : 'Copy link'}
          </button>
          <span className="connection-status">
            <span className="status-dot"></span>
            Connected
          </span>
        </div>
      </div>

      <div className="participants-section">
        <h3>Participants ({users.length})</h3>
        <div className="participants-grid">
          {myUser && (
            <div data-user-id={myUser.id}>
              <UserCard
                userId={myUser.id}
                name={myUser.name}
                vote={votes[myUser.id] || null}
                hasVoted={myUser.hasVoted}
                revealed={revealed}
                isCurrentUser={true}
                onEmojiSend={handleEmojiSend}
              />
            </div>
          )}
          {otherUsers.map(user => (
            <div key={user.id} data-user-id={user.id}>
              <UserCard
                userId={user.id}
                name={user.name}
                vote={votes[user.id] || null}
                hasVoted={user.hasVoted}
                revealed={revealed}
                isCurrentUser={false}
                onEmojiSend={handleEmojiSend}
              />
            </div>
          ))}
        </div>
      </div>

      {flyingEmojis.map(emoji => (
        <FlyingEmoji
          key={emoji.id}
          data={emoji}
          onComplete={handleEmojiComplete}
        />
      ))}

      <div className="action-section">
        {!revealed ? (
          <div className="action-card">
            <p className="action-message">Waiting for votes</p>
            <button
              className="action-button reveal"
              onClick={handleReveal}
              disabled={users.length < 2 || !users.some(u => u.hasVoted)}
            >
              Reveal cards
            </button>
          </div>
        ) : (
          <div className="action-card">
            <button
              className="action-button reset"
              onClick={handleReset}
            >
              Start new round
            </button>
          </div>
        )}
      </div>

      {revealed && statistics && (
        <div className="results-section">
          <div className="statistics">
            <div className="stat-item">
              <span className="stat-label">Average</span>
              <span className="stat-value">{statistics.average}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Agreement</span>
              <div className={`agreement-indicator ${statistics.hasAgreement ? 'good' : 'poor'}`}>
                <svg viewBox="0 0 100 100" className="agreement-circle">
                  <circle cx="50" cy="50" r="45" />
                  {statistics.hasAgreement && (
                    <path
                      d="M30 50 L45 65 L70 35"
                      stroke="white"
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </div>
            </div>
            <div className="votes-distribution">
              {Object.entries(statistics.voteCounts).map(([vote, count]) => (
                <div key={vote} className="vote-count">
                  <span className="vote-value">{vote}</span>
                  <span className="vote-num">{count} Vote{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="individual-scores">
            <h3>Individual scores</h3>
            <table className="scores-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Vote</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className={user.id === myUserId ? 'current-user-row' : ''}>
                    <td className="participant-name">
                      {user.name}
                      {user.id === myUserId && ' (you)'}
                    </td>
                    <td className="participant-vote">{votes[user.id] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="voting-section">
        <h3>Your estimate</h3>
        <div className="voting-cards">
          {CARD_VALUES.map(value => (
            <VotingCard
              key={value}
              value={value}
              selected={selectedCard === value}
              onClick={() => handleCardClick(value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
