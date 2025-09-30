import { useMemo, useState } from 'react'
import './App.css'

type Player = 'black' | 'white'
type CellState = Player | null
type SkillId = 'sandstorm' | 'mountain' | 'rewind'
type GameStatus = 'playing' | 'won' | 'draw'

interface Move {
  row: number
  col: number
  player: Player
}

const BOARD_SIZE = 15

const PLAYER_META: Record<
  Player,
  {
    label: string
    slogan: string
    accent: string
  }
> = {
  black: {
    label: '技能校长·黑子',
    slogan: '自带综艺光环的老江湖',
    accent: '#ffd447',
  },
  white: {
    label: '舞力新人·白子',
    slogan: '爆梗体质的后起之秀',
    accent: '#74d2ff',
  },
}

const INITIAL_SKILL_STOCK: Record<SkillId, number> = {
  sandstorm: 1,
  mountain: 1,
  rewind: 1,
}

const SKILL_META: Record<
  SkillId,
  {
    name: string
    subtitle: string
    description: string
    requiresTarget: boolean
  }
> = {
  sandstorm: {
    name: '飞沙走石',
    subtitle: '3×3 区域清场',
    description: '选定一个交叉点，吹散周围 3×3 的棋子。传说中的“摆造型”技能，留出舞台再说。',
    requiresTarget: true,
  },
  mountain: {
    name: '力拔山兮',
    subtitle: '摔飞对手最新落子',
    description: '把对手刚刚落下的棋子摔出棋盘，犹如摔帽子般霸气。',
    requiresTarget: false,
  },
  rewind: {
    name: '时光倒流',
    subtitle: '倒回上一轮',
    description: '时间回溯一回合，抹掉双方上一手，把节奏重新掌控在自己手上。',
    requiresTarget: false,
  },
}

const SKILL_ORDER: SkillId[] = ['sandstorm', 'mountain', 'rewind']

const buildSkillState = () => ({
  black: { ...INITIAL_SKILL_STOCK },
  white: { ...INITIAL_SKILL_STOCK },
})

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  )
}

function cloneBoard(board: CellState[][]): CellState[][] {
  return board.map((row) => [...row])
}

const DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

function countDirection(
  board: CellState[][],
  row: number,
  col: number,
  player: Player,
  deltaRow: number,
  deltaCol: number,
): number {
  let r = row + deltaRow
  let c = col + deltaCol
  let count = 0
  while (
    r >= 0 &&
    c >= 0 &&
    r < board.length &&
    c < board.length &&
    board[r][c] === player
  ) {
    count += 1
    r += deltaRow
    c += deltaCol
  }
  return count
}

function checkWin(
  board: CellState[][],
  row: number,
  col: number,
  player: Player,
): boolean {
  return DIRECTIONS.some(([deltaRow, deltaCol]) => {
    const forward = countDirection(board, row, col, player, deltaRow, deltaCol)
    const backward = countDirection(
      board,
      row,
      col,
      player,
      -deltaRow,
      -deltaCol,
    )
    return forward + backward + 1 >= 5
  })
}

function isBoardFull(board: CellState[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== null))
}

function keyFor(row: number, col: number) {
  return `${row}-${col}`
}

function App() {
  const [board, setBoard] = useState<CellState[][]>(() => createEmptyBoard())
  const [currentPlayer, setCurrentPlayer] = useState<Player>('black')
  const [history, setHistory] = useState<Move[]>([])
  const [status, setStatus] = useState<GameStatus>('playing')
  const [winner, setWinner] = useState<Player | null>(null)
  const [scores, setScores] = useState<Record<Player, number>>({
    black: 0,
    white: 0,
  })
  const [skillUses, setSkillUses] = useState(
    () => buildSkillState(),
  )
  const [pendingSkill, setPendingSkill] = useState<SkillId | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>(
    '开局！技能校长·黑子率先出招。',
  )

  const otherPlayer: Player = currentPlayer === 'black' ? 'white' : 'black'

  const consumeSkillUse = (player: Player, skill: SkillId) => {
    setSkillUses((prev) => ({
      ...prev,
      [player]: {
        ...prev[player],
        [skill]: prev[player][skill] - 1,
      },
    }))
  }

  const resetOutcome = () => {
    setStatus('playing')
    setWinner(null)
  }

  const handleCellClick = (row: number, col: number) => {
    if (status !== 'playing') {
      return
    }

    if (pendingSkill === 'sandstorm') {
      const didClear = performSandstorm(row, col)
      if (didClear) {
        setPendingSkill(null)
      }
      return
    }

    if (board[row][col]) {
      setStatusMessage('这里早就有人布阵啦，换个点继续放梗。')
      return
    }

    const updatedBoard = cloneBoard(board)
    updatedBoard[row][col] = currentPlayer
    const updatedHistory = [...history, { row, col, player: currentPlayer }]

    setBoard(updatedBoard)
    setHistory(updatedHistory)

    if (checkWin(updatedBoard, row, col, currentPlayer)) {
      setStatus('won')
      setWinner(currentPlayer)
      setPendingSkill(null)
      setScores((prev) => ({
        ...prev,
        [currentPlayer]: prev[currentPlayer] + 1,
      }))
      setStatusMessage(
        `${PLAYER_META[currentPlayer].label} 连线成功！全场爆笑声此起彼伏。`,
      )
      return
    }

    if (isBoardFull(updatedBoard)) {
      setStatus('draw')
      setPendingSkill(null)
      setStatusMessage('棋盘塞满啦！不分胜负，但笑点已经溢出。')
      return
    }

    const nextPlayer = otherPlayer
    setCurrentPlayer(nextPlayer)
    setStatusMessage(`${PLAYER_META[nextPlayer].label} 接棒思考中…`)
  }

  const performSandstorm = (row: number, col: number) => {
    const usesLeft = skillUses[currentPlayer].sandstorm
    if (usesLeft <= 0) {
      setStatusMessage('飞沙走石已经用光啦，留点风沙下期再刮。')
      return false
    }

    const updatedBoard = cloneBoard(board)
    const removed = new Set<string>()

    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
        const targetRow = row + deltaRow
        const targetCol = col + deltaCol
        if (
          targetRow < 0 ||
          targetCol < 0 ||
          targetRow >= BOARD_SIZE ||
          targetCol >= BOARD_SIZE
        ) {
          continue
        }
        if (updatedBoard[targetRow][targetCol] !== null) {
          updatedBoard[targetRow][targetCol] = null
          removed.add(keyFor(targetRow, targetCol))
        }
      }
    }

    if (removed.size === 0) {
      setStatusMessage('此处风平浪静，换个热点位刮风试试。')
      return false
    }

    setBoard(updatedBoard)
    setHistory((prev) => prev.filter((move) => !removed.has(keyFor(move.row, move.col))))
    consumeSkillUse(currentPlayer, 'sandstorm')
    resetOutcome()
    setStatusMessage(`飞沙走石发动！${removed.size} 枚棋子被吹成笑话。`)
    return true
  }

  const performMountain = () => {
    const usesLeft = skillUses[currentPlayer].mountain
    if (usesLeft <= 0) {
      setStatusMessage('力拔山兮耗尽体力啦，先喝口水。')
      return false
    }

    const lastMove = history[history.length - 1]
    if (!lastMove || lastMove.player !== otherPlayer) {
      setStatusMessage('对手最近没出手，摔帽子摔在空气里。')
      return false
    }

    const updatedBoard = cloneBoard(board)
    updatedBoard[lastMove.row][lastMove.col] = null
    setBoard(updatedBoard)
    setHistory((prev) => prev.slice(0, -1))
    consumeSkillUse(currentPlayer, 'mountain')
    resetOutcome()
    setStatusMessage('力拔山兮！对手最新棋子被摔出热搜。')
    return true
  }

  const performRewind = () => {
    const usesLeft = skillUses[currentPlayer].rewind
    if (usesLeft <= 0) {
      setStatusMessage('时光倒流次数用尽，导演喊卡了。')
      return false
    }

    if (history.length < 2) {
      setStatusMessage('节目刚开场，时间线还没素材可剪。')
      return false
    }

    const lastOpponent = history[history.length - 1]
    const lastSelf = history[history.length - 2]

    if (lastOpponent.player !== otherPlayer || lastSelf.player !== currentPlayer) {
      setStatusMessage('镜头切换太快，时光倒流暂时失效。')
      return false
    }

    const updatedBoard = cloneBoard(board)
    updatedBoard[lastOpponent.row][lastOpponent.col] = null
    updatedBoard[lastSelf.row][lastSelf.col] = null

    setBoard(updatedBoard)
    setHistory((prev) => prev.slice(0, -2))
    consumeSkillUse(currentPlayer, 'rewind')
    resetOutcome()
    setStatusMessage('时光倒流成功，剧情重新剪辑！')
    return true
  }

  const handleSkillClick = (skillId: SkillId) => {
    if (status !== 'playing') {
      return
    }

    const usesLeft = skillUses[currentPlayer][skillId]
    if (usesLeft <= 0) {
      setStatusMessage('这张技能卡已经冷却结束，下期再用吧。')
      return
    }

    if (skillId === 'sandstorm') {
      if (pendingSkill === 'sandstorm') {
        setPendingSkill(null)
        setStatusMessage('飞沙走石暂缓，继续正常对弈。')
      } else {
        setPendingSkill('sandstorm')
        setStatusMessage('选择一个交叉点，让飞沙走石来个大场面！')
      }
      return
    }

    if (skillId === 'mountain') {
      performMountain()
      return
    }

    if (skillId === 'rewind') {
      performRewind()
    }
  }

  const resetGame = () => {
    setBoard(createEmptyBoard())
    setHistory([])
    setCurrentPlayer('black')
    setStatus('playing')
    setWinner(null)
    setPendingSkill(null)
    setSkillUses(buildSkillState())
    setStatusMessage('新的一局！技能校长·黑子率先亮相。')
  }

  const spotlightText = useMemo(() => {
    if (status === 'won' && winner) {
      return `${PLAYER_META[winner].label} 喜提本场 MVP！`
    }
    if (status === 'draw') {
      return '势均力敌，梗力并肩！'
    }
    return `${PLAYER_META[currentPlayer].label} 的出招倒计时中…`
  }, [currentPlayer, status, winner])

  const canReset = history.length > 0 || status !== 'playing'

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-badge">热点跟进中</div>
        <h1>技能五子棋 · 综艺同款在线对战</h1>
        <p className="tagline">
          灵感源自腾讯《喜人奇妙夜》爆梗小品，一边下棋一边放技能，用脑洞抢占热搜。
        </p>
      </header>
      <main className="layout">
        <section className="board-section">
          <div
            className={`board ${pendingSkill === 'sandstorm' ? 'board-targeting' : ''}`}
          >
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={keyFor(rowIndex, colIndex)}
                  type="button"
                  className={`board-cell ${cell ? `occupied ${cell}` : ''}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                >
                  {cell && <span className={`stone ${cell}`} />}
                </button>
              )),
            )}
          </div>
          <div className="status-banner">{spotlightText}</div>
          <div className="skill-panel">
            <h2>技能手牌</h2>
            <p className="skills-hint">每回合可灵活发动，次数用完请等待下一局补充。</p>
            <div className="skill-grid">
              {SKILL_ORDER.map((skillId) => {
                const meta = SKILL_META[skillId]
                const usesLeft = skillUses[currentPlayer][skillId]
                const isActive = pendingSkill === skillId
                const disabled = status !== 'playing' || usesLeft <= 0
                return (
                  <button
                    key={skillId}
                    type="button"
                    className={`skill-card ${isActive ? 'skill-card-active' : ''}`}
                    onClick={() => handleSkillClick(skillId)}
                    disabled={disabled && !isActive}
                  >
                    <div className="skill-card-header">
                      <span className="skill-name">{meta.name}</span>
                      <span className="skill-uses">剩余 ×{usesLeft}</span>
                    </div>
                    <div className="skill-subtitle">{meta.subtitle}</div>
                    <p className="skill-description">{meta.description}</p>
                    {isActive && <div className="skill-active-tag">待指定</div>}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
        <aside className="side-panel">
          <div className="status-card">
            <div className="status-heading">本回合焦点</div>
            <div className="status-player" style={{ color: PLAYER_META[currentPlayer].accent }}>
              <span className={`player-dot ${currentPlayer}`} />
              {PLAYER_META[currentPlayer].label}
            </div>
            <p className="status-slogan">{PLAYER_META[currentPlayer].slogan}</p>
            <p className="status-message">{statusMessage}</p>
            {pendingSkill && (
              <p className="status-pending">
                正在准备：{SKILL_META[pendingSkill].name} · {SKILL_META[pendingSkill].subtitle}
              </p>
            )}
          </div>
          <div className="scoreboard">
            <h2>热度积分</h2>
            {(['black', 'white'] as Player[]).map((player) => (
              <div key={player} className="score-row">
                <div className="score-label">
                  <span className={`player-dot ${player}`} />
                  <span>
                    {PLAYER_META[player].label}
                    <span className="score-slogan">{PLAYER_META[player].slogan}</span>
                  </span>
                </div>
                <div className="score-value">{scores[player]}</div>
              </div>
            ))}
          </div>
          <div className="info-card">
            <h2>玩法速记</h2>
            <ul className="info-list">
              <li>同屏双人轮流点击棋盘落子，先连成五子者获胜。</li>
              <li>点技能卡即时生效，飞沙走石需再点棋盘选定 3×3 中心。</li>
              <li>技能每局刷新一次，被吹走或倒流的棋子都会回收。</li>
              <li>建议搭配语音或投屏互动，综艺氛围拉满。</li>
            </ul>
          </div>
          <button
            type="button"
            className="reset-button"
            onClick={resetGame}
            disabled={!canReset}
          >
            再开一局
          </button>
        </aside>
      </main>
    </div>
  )
}

export default App
