import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useGameStore } from '@/store/gameStore';
import Login from '@/pages/Login';
import Lobby from '@/pages/Lobby';
import Matchmaking from '@/pages/Matchmaking';
import Game from '@/pages/Game';
import GameOver from '@/pages/GameOver';
import Leaderboard from '@/pages/Leaderboard';

// ─── Protected Route ──────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const session = useGameStore((s) => s.session);

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/matchmaking"
        element={
          <ProtectedRoute>
            <Matchmaking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game"
        element={
          <ProtectedRoute>
            <Game />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game-over"
        element={
          <ProtectedRoute>
            <GameOver />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Leaderboard />
          </ProtectedRoute>
        }
      />
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
