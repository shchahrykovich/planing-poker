import { useEffect, useState } from 'react';
import './FlyingEmoji.css';

export interface FlyingEmojiData {
  id: string;
  emoji: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface FlyingEmojiProps {
  data: FlyingEmojiData;
  onComplete: (id: string) => void;
}

export function FlyingEmoji({ data, onComplete }: FlyingEmojiProps) {
  const [style, setStyle] = useState<React.CSSProperties>({
    left: `${data.fromX}px`,
    top: `${data.fromY}px`,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setStyle({
        left: `${data.toX}px`,
        top: `${data.toY}px`,
        transform: 'scale(0.5)',
        opacity: 0,
      });
    }, 50);

    const completeTimer = setTimeout(() => {
      onComplete(data.id);
    }, 1600);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [data, onComplete]);

  return (
    <div className="flying-emoji" style={style}>
      {data.emoji}
    </div>
  );
}
