import { useState, useEffect } from 'react';
import { PlanningPoker } from './components/PlanningPoker';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Read room ID from URL and user name from localStorage/Cloudflare on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    if (roomFromUrl) {
      setRoomId(roomFromUrl);
      // Save room ID to localStorage when accessing via direct link
      localStorage.setItem('planningPokerRoomId', roomFromUrl);
    } else {
      // If no room in URL, try to load from localStorage
      const savedRoomId = localStorage.getItem('planningPokerRoomId');
      if (savedRoomId) {
        setRoomId(savedRoomId);
      }
    }

    // Try to get user name from Cloudflare Access first
    const fetchUserInfo = async () => {
      try {
        const response = await fetch('/api/whoami');
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.name) {
            setUserName(data.name);
            localStorage.setItem('planningPokerUserName', data.name);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to fetch user info:', err);
      }

      // Fallback to localStorage if Cloudflare Access is not available
      const savedName = localStorage.getItem('planningPokerUserName');
      if (savedName) {
        setUserName(savedName);
      }
    };

    fetchUserInfo();
  }, []);

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    try {
      const response = await fetch('/api/room', { method: 'POST' });
      const data = await response.json();
      setRoomId(data.roomId);
      // Save newly created room ID to localStorage
      localStorage.setItem('planningPokerRoomId', data.roomId);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim() && userName.trim()) {
      const trimmedRoomId = roomId.trim();

      // Save user name and room ID to localStorage
      localStorage.setItem('planningPokerUserName', userName.trim());
      localStorage.setItem('planningPokerRoomId', trimmedRoomId);

      // Update URL with room ID
      const url = new URL(window.location.href);
      url.searchParams.set('room', trimmedRoomId);
      window.history.pushState({}, '', url);

      setJoined(true);
    }
  };

  if (joined) {
    return <PlanningPoker roomId={roomId} userName={userName} />;
  }

  return (
    <div className="app">
      <div className="welcome-container">
        <h1>Planning Poker</h1>
        <p className="subtitle">Estimate together, decide faster</p>

        <form className="join-form" onSubmit={handleJoinRoom}>
          <div className="form-group">
            <label htmlFor="userName">Your Name</label>
            <input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                if (e.target.value.trim()) {
                  localStorage.setItem('planningPokerUserName', e.target.value.trim());
                }
              }}
              placeholder="Enter your name"
              maxLength={32}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="roomId">Room ID or Name</label>
            <div className="room-input-group">
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  if (e.target.value.trim()) {
                    localStorage.setItem('planningPokerRoomId', e.target.value.trim());
                  }
                }}
                placeholder="Enter room ID or name"
                maxLength={64}
                required
              />
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreatingRoom}
                className="create-room-btn"
              >
                {isCreatingRoom ? 'Creating...' : 'New Room'}
              </button>
            </div>
          </div>

          <button type="submit" className="join-btn">
            Join Room
          </button>
        </form>

        <div className="info-box">
          <h3>How it works</h3>
          <ol>
            <li>Create a new room or enter an existing room ID</li>
            <li>Share the room ID with your team</li>
            <li>Everyone picks their estimation cards</li>
            <li>Reveal cards together and discuss</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default App;
