import { useState, useRef } from 'react';
import { EmojiMenu } from './EmojiMenu';
import './UserCard.css';

interface UserCardProps {
  userId: string;
  name: string;
  vote: string | null;
  hasVoted: boolean;
  revealed: boolean;
  isCurrentUser: boolean;
  onEmojiSend?: (targetUserId: string, emoji: string) => void;
}

export function UserCard({ userId, name, vote, hasVoted, revealed, isCurrentUser, onEmojiSend }: UserCardProps) {
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const getCardContent = () => {
    if (!hasVoted) {
      return null;
    }
    if (revealed) {
      return vote || '?';
    }
    return ''; // Show card back pattern when voted but not revealed
  };

  const cardContent = getCardContent();
  const showCardBack = hasVoted && !revealed;

  const handleEmojiSelect = (emoji: string) => {
    if (onEmojiSend) {
      onEmojiSend(userId, emoji);
    }
  };

  const handleCardClick = () => {
    if (!isCurrentUser) {
      setShowEmojiMenu(true);
    }
  };

  return (
    <div className="user-card" ref={cardRef}>
      <div
        className={`card-display ${showCardBack ? 'card-back' : ''} ${hasVoted ? 'has-vote' : ''} ${!isCurrentUser ? 'clickable' : ''}`}
        onClick={handleCardClick}
      >
        {cardContent !== null && (
          <div className="card-value">{cardContent}</div>
        )}
      </div>
      <div className={`user-name ${isCurrentUser ? 'current-user' : ''}`}>
        {name}
        {isCurrentUser && ' (you)'}
      </div>
      {showEmojiMenu && (
        <EmojiMenu
          onEmojiSelect={handleEmojiSelect}
          onClose={() => setShowEmojiMenu(false)}
        />
      )}
    </div>
  );
}
