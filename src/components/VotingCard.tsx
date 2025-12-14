import './VotingCard.css';

interface VotingCardProps {
  value: string;
  selected: boolean;
  onClick: () => void;
}

export function VotingCard({ value, selected, onClick }: VotingCardProps) {
  return (
    <button
      className={`voting-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {value}
    </button>
  );
}
