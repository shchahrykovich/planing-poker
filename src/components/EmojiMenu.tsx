import './EmojiMenu.css';

interface EmojiMenuProps {
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJIS = ['🎯', '✈️', '🐘', '❤️'];

export function EmojiMenu({ onEmojiSelect, onClose }: EmojiMenuProps) {
  return (
    <>
      <div className="emoji-menu-overlay" onClick={onClose} />
      <div className="emoji-menu">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className="emoji-button"
            onClick={() => {
              onEmojiSelect(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
