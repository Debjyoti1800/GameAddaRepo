import { useState } from 'react'
import Game2048 from './components/2048Game'
import BunnyMaze from './components/BunnyMaze'
import FlappyBird from './components/FlappyBird'
import SpiderSolitaire from './components/SpiderSolitaire'
import TicTacToe from './components/TicTacToe'
import game2048Image from './assets/2048Game.png'
import bunnyMazeImage from './assets/BunnyMaze.png'
import flappyImage from './assets/FlappyBird.png'
import spiderImage from './assets/SpiderSolitaire.png'
import ticTacToeImage from './assets/TicTacToe.png'
import './App.css'

type GameId = 'flappy' | 'tic-tac-toe' | 'spider-solitaire' | '2048' | 'bunny-maze'

const games: {
  id: GameId
  title: string
  category: string
  description: string
  image: string
  accent: string
  players: string
}[] = [
  {
    id: '2048',
    title: '2048',
    category: 'PUZZLE · NUMBER GAME',
    description: 'Slide, combine, and keep the board moving toward 2048.',
    image: game2048Image,
    accent: 'ember',
    players: '1 PLAYER',
  },
  {
    id: 'bunny-maze',
    title: 'Bunny Maze',
    category: 'ARCADE · MAZE RUNNER',
    description: 'Nibble every carrot and dodge the robots in the garden.',
    image: bunnyMazeImage,
    accent: 'felt',
    players: '1 PLAYER',
  },
  {
    id: 'flappy',
    title: 'Flappy Bird',
    category: 'ARCADE · QUICK PLAY',
    description: 'One more try. Tap your way through a sky full of trouble.',
    image: flappyImage,
    accent: 'sky',
    players: '1 PLAYER',
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    category: 'PUZZLE · HEAD TO HEAD',
    description: 'Outsmart the computer or settle it with a friend.',
    image: ticTacToeImage,
    accent: 'ember',
    players: '1–2 PLAYERS',
  },
  {
    id: 'spider-solitaire',
    title: 'Spider Solitaire',
    category: 'CARD · STRATEGY',
    description: 'Deal a hand, find the pattern, clear the whole web.',
    image: spiderImage,
    accent: 'felt',
    players: '1 PLAYER',
  },
]

function App() {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null)

  if (selectedGame) {
    return (
      <main className="game-screen">
        <div className="game-topbar">
          <button className="back-button" onClick={() => setSelectedGame(null)}>
            <span aria-hidden="true">←</span> Arcade
          </button>
          <span className="game-topbar-label">GAMESADDA / PLAY</span>
          <span className="game-topbar-spacer" aria-hidden="true" />
        </div>
        {selectedGame === 'flappy' && <FlappyBird />}
        {selectedGame === 'tic-tac-toe' && <TicTacToe />}
        {selectedGame === 'spider-solitaire' && <SpiderSolitaire />}
        {selectedGame === '2048' && <Game2048 />}
        {selectedGame === 'bunny-maze' && <BunnyMaze />}
      </main>
    )
  }

  return (
    <main className="arcade-page">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="GamesAdda home">
          <span className="wordmark-mark" aria-hidden="true">G</span>
          <span>games<span className="wordmark-light">adda</span></span>
        </a>
        <a className="header-link" href="#games">THE ARCADE <span aria-hidden="true">↘</span></a>
      </header>

      <section className="hero-section" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> YOUR NEXT FAVORITE IS HERE</p>
          <h1>Good games.<br /><span>Great breaks.</span></h1>
          <p className="hero-description">A little arcade for the in-between. Pick a game, settle in, and see where the next round takes you.</p>
          <a className="hero-cta" href="#games">Explore the games <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-halo" />
          <img src={flappyImage} alt="" />
          <div className="hero-sticker sticker-top">INSERT<br />GOOD MOOD</div>
          <div className="hero-sticker sticker-bottom"><span>{games.length}</span> GAMES<br />READY TO PLAY</div>
        </div>
        <div className="hero-index" aria-hidden="true"><span>01</span> / {String(games.length).padStart(2, '0')}</div>
      </section>

      <section className="games-section" id="games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PICK YOUR PLAY</p>
            <h2>The game shelf<span className="heading-period">.</span></h2>
          </div>
          <p className="section-note">Five ways to take five.<br />More fun, less scrolling.</p>
        </div>

        <div className="game-grid">
          {games.map((game, index) => (
            <button
              className={`game-card ${game.accent}`}
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              aria-label={`Play ${game.title}`}
            >
              <span className="card-image-wrap">
                <img className="card-image" src={game.image} alt={`${game.title} game artwork`} />
                <span className="card-number">0{index + 1}</span>
                <span className="card-play" aria-hidden="true">↗</span>
              </span>
              <span className="card-content">
                <span className="card-category">{game.category}</span>
                <span className="card-title">{game.title}</span>
                <span className="card-description">{game.description}</span>
                <span className="card-footer"><span>{game.players}</span><span>PLAY NOW <b aria-hidden="true">→</b></span></span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>GAMESADDA <span className="footer-dot">●</span> MADE FOR YOUR NEXT BREAK</span>
        <a href="#top">BACK TO TOP ↑</a>
      </footer>
    </main>
  )
}

export default App
