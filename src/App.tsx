import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { createInviteCode, randomFunnyName } from './utils/random'
import './App.css'

type Player = 'black' | 'white'
type CellState = Player | null
type SkillId = 'sandstorm' | 'mountain' | 'rewind'
type GameStatus = 'playing' | 'won' | 'draw'
type RoomStatus = 'idle' | 'lobby' | 'playing' | 'finished'

type PlayerRole = 'host' | 'guest'

interface Move {
  row: number
  col: number
  player: Player
}

interface PlayerMeta {
  id: string
  name: string
  color: Player
  role: PlayerRole
  ready: boolean
}

interface PlayerSnapshot {
  id: string
  name: string
  color: Player
  ready: boolean
}

interface GameState {
  board: CellState[][]
  history: Move[]
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  scores: Record<Player, number>
  skillUses: Record<Player, Record<SkillId, number>>
  pendingSkill: SkillId | null
  statusMessage: string
}

interface SnapshotPayload {
  room: {
    code: string
    status: RoomStatus
  }
  players: {
    host: PlayerSnapshot
    guest?: PlayerSnapshot
  }
  spectators: Spectator[]
  game: GameState
}

interface Spectator {
  id: string
  name: string
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

const OTHER_PLAYER: Record<Player, Player> = {
  black: 'white',
  white: 'black',
}

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

function freshGameState(previous?: GameState, statusMessage?: string): GameState {
  return {
    board: createEmptyBoard(),
    history: [],
    currentPlayer: 'black',
    status: 'playing',
    winner: null,
    scores: previous ? { ...previous.scores } : { black: 0, white: 0 },
    skillUses: buildSkillState(),
    pendingSkill: null,
    statusMessage: statusMessage ?? '等待对局开始。',
  }
}

function applySandstorm(
  state: GameState,
  row: number,
  col: number,
  player: Player,
): { next: GameState; success: boolean; removed: number; message: string } {
  const usesLeft = state.skillUses[player].sandstorm
  if (usesLeft <= 0) {
    return {
      next: { ...state, statusMessage: '飞沙走石已经用光啦，留点风沙下期再刮。' },
      success: false,
      removed: 0,
      message: '飞沙走石已经用光啦，留点风沙下期再刮。',
    }
  }

  const updatedBoard = cloneBoard(state.board)
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
    return {
      next: { ...state, statusMessage: '此处风平浪静，换个热点位刮风试试。' },
      success: false,
      removed: 0,
      message: '此处风平浪静，换个热点位刮风试试。',
    }
  }

  const nextHistory = state.history.filter(
    (move) => !removed.has(keyFor(move.row, move.col)),
  )

  const next: GameState = {
    ...state,
    board: updatedBoard,
    history: nextHistory,
    skillUses: {
      ...state.skillUses,
      [player]: {
        ...state.skillUses[player],
        sandstorm: usesLeft - 1,
      },
    },
    pendingSkill: null,
    status: 'playing',
    winner: null,
    statusMessage: `飞沙走石发动！${removed.size} 枚棋子被吹成笑话。`,
  }

  return { next, success: true, removed: removed.size, message: next.statusMessage }
}

function applyMountain(
  state: GameState,
  player: Player,
): { next: GameState; success: boolean; message: string } {
  const usesLeft = state.skillUses[player].mountain
  if (usesLeft <= 0) {
    return {
      next: { ...state, statusMessage: '力拔山兮耗尽体力啦，先喝口水。' },
      success: false,
      message: '力拔山兮耗尽体力啦，先喝口水。',
    }
  }

  const lastMove = state.history[state.history.length - 1]
  if (!lastMove || lastMove.player === player) {
    return {
      next: { ...state, statusMessage: '对手最近没出手，摔帽子摔在空气里。' },
      success: false,
      message: '对手最近没出手，摔帽子摔在空气里。',
    }
  }

  const updatedBoard = cloneBoard(state.board)
  updatedBoard[lastMove.row][lastMove.col] = null

  const next: GameState = {
    ...state,
    board: updatedBoard,
    history: state.history.slice(0, -1),
    skillUses: {
      ...state.skillUses,
      [player]: {
        ...state.skillUses[player],
        mountain: usesLeft - 1,
      },
    },
    pendingSkill: null,
    status: 'playing',
    winner: null,
    statusMessage: '力拔山兮！对手最新棋子被摔出热搜。',
  }

  return { next, success: true, message: next.statusMessage }
}

function applyRewind(
  state: GameState,
  player: Player,
): { next: GameState; success: boolean; message: string } {
  const usesLeft = state.skillUses[player].rewind
  if (usesLeft <= 0) {
    return {
      next: { ...state, statusMessage: '时光倒流次数用尽，导演喊卡了。' },
      success: false,
      message: '时光倒流次数用尽，导演喊卡了。',
    }
  }

  if (state.history.length < 2) {
    return {
      next: { ...state, statusMessage: '节目刚开场，时间线还没素材可剪。' },
      success: false,
      message: '节目刚开场，时间线还没素材可剪。',
    }
  }

  const lastOpponent = state.history[state.history.length - 1]
  const lastSelf = state.history[state.history.length - 2]

  if (lastOpponent.player === player || lastSelf.player !== player) {
    return {
      next: { ...state, statusMessage: '镜头切换太快，时光倒流暂时失效。' },
      success: false,
      message: '镜头切换太快，时光倒流暂时失效。',
    }
  }

  const updatedBoard = cloneBoard(state.board)
  updatedBoard[lastOpponent.row][lastOpponent.col] = null
  updatedBoard[lastSelf.row][lastSelf.col] = null

  const next: GameState = {
    ...state,
    board: updatedBoard,
    history: state.history.slice(0, -2),
    skillUses: {
      ...state.skillUses,
      [player]: {
        ...state.skillUses[player],
        rewind: usesLeft - 1,
      },
    },
    pendingSkill: null,
    status: 'playing',
    winner: null,
    statusMessage: '时光倒流成功，剧情重新剪辑！',
  }

  return { next, success: true, message: next.statusMessage }
}

function applyMove(
  state: GameState,
  row: number,
  col: number,
  player: Player,
  playerName: string,
  opponentName: string,
): { next: GameState; success: boolean; outcome: 'move' | 'win' | 'draw'; message: string } {
  if (state.board[row][col]) {
    return {
      next: { ...state, statusMessage: '这里早就有人布阵啦，换个点继续放梗。' },
      success: false,
      outcome: 'move',
      message: '这里早就有人布阵啦，换个点继续放梗。',
    }
  }

  const updatedBoard = cloneBoard(state.board)
  updatedBoard[row][col] = player
  const updatedHistory = [...state.history, { row, col, player }]
  const baseState: GameState = {
    ...state,
    board: updatedBoard,
    history: updatedHistory,
    statusMessage: `${playerName} 落子，舞台灯光对准 ${opponentName}。`,
    pendingSkill: null,
  }

  if (checkWin(updatedBoard, row, col, player)) {
    const next: GameState = {
      ...baseState,
      status: 'won',
      winner: player,
      scores: {
        ...baseState.scores,
        [player]: baseState.scores[player] + 1,
      },
      statusMessage: `${playerName} 连线成功！全场爆笑声此起彼伏。`,
    }
    return { next, success: true, outcome: 'win', message: next.statusMessage }
  }

  if (isBoardFull(updatedBoard)) {
    const next: GameState = {
      ...baseState,
      status: 'draw',
      statusMessage: '棋盘塞满啦！不分胜负，但笑点已经溢出。',
    }
    return { next, success: true, outcome: 'draw', message: next.statusMessage }
  }

  const next: GameState = {
    ...baseState,
    currentPlayer: OTHER_PLAYER[player],
    status: 'playing',
    winner: null,
    statusMessage: `${opponentName} 接棒思考中…`,
  }

  return { next, success: true, outcome: 'move', message: next.statusMessage }
}

function snapshotToPlayerMeta(
  snapshot: PlayerSnapshot,
  role: PlayerRole,
): PlayerMeta {
  return { ...snapshot, role }
}

function playerSnapshot(meta: PlayerMeta | null): PlayerSnapshot | undefined {
  if (!meta) return undefined
  const { id, name, color, ready } = meta
  return { id, name, color, ready }
}

function getShareLink(code: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('code', code)
  return url.toString()
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [gameState, setGameState] = useState<GameState>(() =>
    freshGameState(undefined, '点击创建或加入房间，一起整活儿！'),
  )
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('idle')
  const [hostPlayer, setHostPlayer] = useState<PlayerMeta | null>(null)
  const [guestPlayer, setGuestPlayer] = useState<PlayerMeta | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [spectators, setSpectators] = useState<Spectator[]>([])
  const [localSpectatorName, setLocalSpectatorName] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const gameStateRef = useRef(gameState)
  const roomStatusRef = useRef(roomStatus)
  const roomCodeRef = useRef(roomCode)
  const hostPlayerRef = useRef(hostPlayer)
  const guestPlayerRef = useRef(guestPlayer)
  const spectatorsRef = useRef<Spectator[]>(spectators)

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    roomStatusRef.current = roomStatus
  }, [roomStatus])

  useEffect(() => {
    roomCodeRef.current = roomCode
  }, [roomCode])

  useEffect(() => {
    hostPlayerRef.current = hostPlayer
  }, [hostPlayer])

  useEffect(() => {
    guestPlayerRef.current = guestPlayer
  }, [guestPlayer])

  useEffect(() => {
    spectatorsRef.current = spectators
  }, [spectators])

  useEffect(() => {
    if (!session?.user.id) {
      setLocalSpectatorName(null)
      return
    }
    const found = spectators.find((spectator) => spectator.id === session.user.id)
    setLocalSpectatorName(found ? found.name : null)
  }, [spectators, session])

  const localPlayer = useMemo(() => {
    const userId = session?.user.id
    if (!userId) return null
    if (hostPlayer?.id === userId) return hostPlayer
    if (guestPlayer?.id === userId) return guestPlayer
    return null
  }, [session, hostPlayer, guestPlayer])

  const opponent = useMemo(() => {
    const userId = session?.user.id
    if (!userId) return null
    if (hostPlayer?.id === userId) return guestPlayer
    if (guestPlayer?.id === userId) return hostPlayer
    return null
  }, [session, hostPlayer, guestPlayer])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (mounted) {
        setSession(data.session)
        setAuthLoading(false)
      }
      if (!data.session) {
        const { data: anonData } = await supabase.auth.signInAnonymously()
        if (mounted) {
          setSession(anonData.session)
        }
      }
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, newSession) => {
        setSession(newSession)
      },
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code && session && !roomCodeRef.current) {
      handleJoinRoom(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const disconnectChannel = async () => {
    if (channelRef.current) {
      await channelRef.current.unsubscribe()
      channelRef.current = null
    }
  }

  const broadcastSnapshot = (
    overrides?: {
      game?: GameState
      host?: PlayerMeta | null
      guest?: PlayerMeta | null
      status?: RoomStatus
      spectators?: Spectator[]
    },
  ) => {
    const channel = channelRef.current
    const code = roomCodeRef.current
    const host = overrides?.host ?? hostPlayerRef.current
    if (!channel || !code || !host) {
      return
    }

    const payload: SnapshotPayload = {
      room: {
        code,
        status: overrides?.status ?? roomStatusRef.current,
      },
      players: {
        host: playerSnapshot(host)!,
        guest: playerSnapshot(overrides?.guest ?? guestPlayerRef.current),
      },
      spectators: overrides?.spectators ?? spectatorsRef.current,
      game: overrides?.game ?? gameStateRef.current,
    }

    channel.send({ type: 'broadcast', event: 'snapshot', payload })
  }

  const applySnapshot = (payload: SnapshotPayload) => {
    setRoomCode(payload.room.code)
    setRoomStatus(payload.room.status)
    setHostPlayer(snapshotToPlayerMeta(payload.players.host, 'host'))
    setGuestPlayer(
      payload.players.guest
        ? snapshotToPlayerMeta(payload.players.guest, 'guest')
        : null,
    )
    setSpectators(payload.spectators ?? [])
    setGameState(payload.game)
  }

  const handleJoinRequest = (payload: { playerId: string; name: string }) => {
    if (!session || session.user.id !== hostPlayerRef.current?.id) return

    const host = hostPlayerRef.current
    if (!host) return

    const currentGuest = guestPlayerRef.current
    const existingSpectator = spectatorsRef.current.find(
      (spectator) => spectator.id === payload.playerId,
    )
    if (currentGuest && currentGuest.id !== payload.playerId) {
      const nextSpectators = existingSpectator
        ? spectatorsRef.current.map((spectator) =>
            spectator.id === payload.playerId
              ? { ...spectator, name: payload.name }
              : spectator,
          )
        : [...spectatorsRef.current, { id: payload.playerId, name: payload.name }]

      setSpectators(nextSpectators)
      broadcastSnapshot({ spectators: nextSpectators })
      return
    }

    const updatedHost: PlayerMeta = { ...host, ready: false }
    const assignedColor: Player = host.color === 'black' ? 'white' : 'black'
    const guest: PlayerMeta =
      currentGuest && currentGuest.id === payload.playerId
        ? { ...currentGuest, name: payload.name, ready: false }
        : {
            id: payload.playerId,
            name: payload.name,
            color: assignedColor,
            role: 'guest',
            ready: false,
          }

    const nextGame = freshGameState(undefined, `${host.name} 等待 ${guest.name} 加入战局。`)
    const updatedSpectators = spectatorsRef.current.filter(
      (spectator) => spectator.id !== payload.playerId,
    )

    setHostPlayer(updatedHost)
    setGuestPlayer(guest)
    setRoomStatus('lobby')
    setGameState(nextGame)
    setSpectators(updatedSpectators)

    broadcastSnapshot({
      host: updatedHost,
      guest,
      status: 'lobby',
      game: nextGame,
      spectators: updatedSpectators,
    })
  }

  const subscribeToRoom = async (
    code: string,
    role: PlayerRole,
    playerMeta: PlayerMeta,
  ) => {
    if (!session) return

    await disconnectChannel()

    const channel = supabase.channel(`room:${code}`, {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    })

    channel
      .on('broadcast', { event: 'join-request' }, ({ payload }) => {
        handleJoinRequest(payload as { playerId: string; name: string })
      })
      .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
        applySnapshot(payload as SnapshotPayload)
      })
      .on('broadcast', { event: 'state-request' }, ({ payload }) => {
        if (session.user.id === hostPlayerRef.current?.id) {
          const requestedId = (payload as { playerId: string }).playerId
          if (requestedId) {
            broadcastSnapshot()
          }
        }
      })

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel
        await channel.track({ playerId: playerMeta.id, name: playerMeta.name, role })
        if (role === 'host') {
          broadcastSnapshot({ host: playerMeta, status: 'lobby' })
        } else {
          channel.send({
            type: 'broadcast',
            event: 'join-request',
            payload: { playerId: playerMeta.id, name: playerMeta.name },
          })
          channel.send({
            type: 'broadcast',
            event: 'state-request',
            payload: { playerId: playerMeta.id },
          })
        }
      }
    })

    setErrorMessage(null)
  }

  const handleCreateRoom = async (color: Player) => {
    if (!session) return

    const code = createInviteCode(4)
    const name = randomFunnyName()
    const hostMeta: PlayerMeta = {
      id: session.user.id,
      name,
      color,
      role: 'host',
      ready: false,
    }

    const intro = `${name} 选择 ${color === 'black' ? '黑' : '白'}子，等待对手输入邀请码 ${code}`
    setHostPlayer(hostMeta)
    setGuestPlayer(null)
    setRoomCode(code)
    setRoomStatus('lobby')
    setGameState(freshGameState(undefined, intro))
    setErrorMessage(null)
    setSpectators([])
    setLocalSpectatorName(null)

    await subscribeToRoom(code, 'host', hostMeta)

    const url = new URL(window.location.href)
    url.searchParams.set('code', code)
    window.history.replaceState({}, '', url)
  }

  const handleJoinRoom = async (code: string) => {
    if (!session) return

    const trimmed = code.trim()
    if (trimmed.length !== 4) {
      setErrorMessage('邀请码需要 4 位字符。')
      return
    }

    const name = randomFunnyName([hostPlayerRef.current?.name ?? ''])
    setLocalSpectatorName(name)
    setRoomCode(trimmed)
    setRoomStatus('lobby')
    setGameState((prev) => ({
      ...prev,
      statusMessage: `正在尝试加入房间 ${trimmed} ……`,
    }))
    setErrorMessage(null)
    setSpectators([])

    const pseudoPlayer: PlayerMeta = {
      id: session.user.id,
      name,
      color: 'white',
      role: 'guest',
      ready: false,
    }

    await subscribeToRoom(trimmed, 'guest', pseudoPlayer)

    const url = new URL(window.location.href)
    url.searchParams.set('code', trimmed)
    window.history.replaceState({}, '', url)
  }

  const getPlayerNameByColor = (color: Player) => {
    if (hostPlayer?.color === color) return hostPlayer.name
    if (guestPlayer?.color === color) return guestPlayer.name
    return PLAYER_META[color].label
  }

  const toggleReady = () => {
    if (!localPlayer) return
    if (roomStatus === 'playing' && gameState.status === 'playing') return

    const updatedLocal: PlayerMeta = { ...localPlayer, ready: !localPlayer.ready }
    let updatedHost = hostPlayerRef.current
    let updatedGuest = guestPlayerRef.current

    if (updatedLocal.role === 'host') {
      updatedHost = updatedLocal
    } else {
      updatedGuest = updatedLocal
    }

    let nextRoomStatus: RoomStatus = roomStatusRef.current
    let nextGame = gameStateRef.current

    if (updatedHost?.ready && updatedGuest?.ready) {
      const message = `${getPlayerNameByColor('black')} 执黑先手，准备开战！`
      nextGame = freshGameState(gameStateRef.current, message)
      nextRoomStatus = 'playing'
      updatedHost = updatedHost ? { ...updatedHost, ready: false } : null
      updatedGuest = updatedGuest ? { ...updatedGuest, ready: false } : null
    } else {
      nextGame = {
        ...gameStateRef.current,
        statusMessage:
          updatedHost?.ready || updatedGuest?.ready
            ? `${updatedLocal.name} 已就绪，等待对手确认。`
            : '等待双方点击就绪，黑子开局。',
      }
      nextRoomStatus = 'lobby'
    }

    setHostPlayer(updatedHost)
    setGuestPlayer(updatedGuest)
    setRoomStatus(nextRoomStatus)
    setGameState(nextGame)

    broadcastSnapshot({
      host: updatedHost,
      guest: updatedGuest,
      status: nextRoomStatus,
      game: nextGame,
    })
  }

  const handleResetGame = () => {
    const message = '准备下一局，请双方再次点击就绪。'
    const nextGame = freshGameState(gameStateRef.current, message)
    const updatedHost = hostPlayerRef.current
      ? { ...hostPlayerRef.current, ready: false }
      : null
    const updatedGuest = guestPlayerRef.current
      ? { ...guestPlayerRef.current, ready: false }
      : null

    setGameState(nextGame)
    setHostPlayer(updatedHost)
    setGuestPlayer(updatedGuest)
    setRoomStatus('lobby')

    broadcastSnapshot({
      host: updatedHost,
      guest: updatedGuest,
      status: 'lobby',
      game: nextGame,
    })
  }

  const handleCellClick = (row: number, col: number) => {
    if (roomStatus !== 'playing') return
    if (gameState.status !== 'playing') return
    if (!localPlayer) return
    if (localPlayer.color !== gameState.currentPlayer) return

    if (gameState.pendingSkill === 'sandstorm') {
      const result = applySandstorm(gameState, row, col, localPlayer.color)
      setGameState(result.next)
      if (result.success) {
        broadcastSnapshot({ game: result.next })
      }
      return
    }

    const result = applyMove(
      gameState,
      row,
      col,
      localPlayer.color,
      getPlayerNameByColor(localPlayer.color),
      getPlayerNameByColor(OTHER_PLAYER[localPlayer.color]),
    )

    setGameState(result.next)

    if (!result.success) {
      return
    }

    let nextRoomStatus: RoomStatus = roomStatus
    if (result.outcome === 'win' || result.outcome === 'draw') {
      nextRoomStatus = 'finished'
      setRoomStatus(nextRoomStatus)
    }

    broadcastSnapshot({ game: result.next, status: nextRoomStatus })
  }

  const handleSkillClick = (skillId: SkillId) => {
    if (roomStatus !== 'playing') return
    if (gameState.status !== 'playing') return
    if (!localPlayer) return
    if (localPlayer.color !== gameState.currentPlayer) return

    if (skillId === 'sandstorm') {
      const isActive = gameState.pendingSkill === 'sandstorm'
      const next: GameState = {
        ...gameState,
        pendingSkill: isActive ? null : 'sandstorm',
        statusMessage: isActive
          ? '飞沙走石暂缓，继续正常对弈。'
          : '选择一个交叉点，让飞沙走石来个大场面！',
      }
      setGameState(next)
      broadcastSnapshot({ game: next })
      return
    }

    if (skillId === 'mountain') {
      const result = applyMountain(gameState, localPlayer.color)
      setGameState(result.next)
      if (result.success) {
        broadcastSnapshot({ game: result.next })
      }
      return
    }

    if (skillId === 'rewind') {
      const result = applyRewind(gameState, localPlayer.color)
      setGameState(result.next)
      if (result.success) {
        broadcastSnapshot({ game: result.next })
      }
    }
  }

  const canReset = roomStatus === 'finished'
  const readyDisabled = !localPlayer || roomStatus !== 'lobby'
  const spotlightText = useMemo(() => {
    if (roomStatus === 'lobby') {
      const waitingName = hostPlayer?.ready
        ? guestPlayer?.name ?? '对手'
        : hostPlayer?.name ?? '双方'
      return `等待 ${waitingName} 就绪中…`
    }
    if (roomStatus === 'finished') {
      if (gameState.status === 'won' && gameState.winner) {
        return `${getPlayerNameByColor(gameState.winner)} 喜提本场 MVP！`
      }
      if (gameState.status === 'draw') {
        return '势均力敌，梗力并肩！'
      }
    }
    if (roomStatus === 'playing' && gameState.status === 'playing') {
      return `${getPlayerNameByColor(gameState.currentPlayer)} 的出招倒计时中…`
    }
    return '随时准备开局，保持好梗力！'
  }, [roomStatus, gameState, hostPlayer, guestPlayer])

  if (authLoading) {
    return (
      <div className="app">
        <header className="hero">
          <div className="hero-badge">加载中</div>
          <h1>技能五子棋 · 综艺同款在线对战</h1>
          <p className="tagline">正在初始化你的综艺舞台……</p>
        </header>
      </div>
    )
  }

  const shareLink = roomCode ? getShareLink(roomCode) : ''
  const inviteInfo = roomCode ? `邀请码 ${roomCode}` : '未创建房间'

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-badge">热点跟进中</div>
        <h1>技能五子棋 · 综艺同款在线对战</h1>
        <p className="tagline">
          灵感源自腾讯《喜人奇妙夜》爆梗小品，一边下棋一边放技能，用脑洞抢占热搜。
        </p>
      </header>

      <div className="room-toolbar">
        <div className="room-code">{inviteInfo}</div>
        {roomCode ? (
          <button
            type="button"
            className="copy-button"
            onClick={() => navigator.clipboard.writeText(shareLink)}
          >
            复制邀请链接
          </button>
        ) : null}
        {errorMessage && <div className="room-error">{errorMessage}</div>}
      </div>

      {roomStatus === 'idle' && (
        <div className="lobby-panel">
          <div className="lobby-card">
            <h2>创建新房间</h2>
            <p>选择执子颜色，生成 4 位邀请码，分享给你的对战搭档。</p>
            <div className="color-toggle">
              <button
                type="button"
                onClick={() => handleCreateRoom('black')}
              >
                我来执黑
              </button>
              <button
                type="button"
                onClick={() => handleCreateRoom('white')}
              >
                我来执白
              </button>
            </div>
          </div>
          <div className="lobby-card">
            <h2>加入房间</h2>
            <JoinForm onJoin={handleJoinRoom} />
          </div>
        </div>
      )}

      {roomStatus !== 'idle' && (
        <main className="layout">
          <section className="board-section">
            <div
              className={`board ${gameState.pendingSkill === 'sandstorm' ? 'board-targeting' : ''}`}
            >
              {gameState.board.map((row, rowIndex) =>
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
                  const usesLeft = localPlayer
                    ? gameState.skillUses[localPlayer.color][skillId]
                    : 0
                  const isActive = gameState.pendingSkill === skillId
                  const disabled =
                    !localPlayer ||
                    roomStatus !== 'playing' ||
                    gameState.status !== 'playing' ||
                    localPlayer.color !== gameState.currentPlayer ||
                    (usesLeft <= 0 && !isActive)

                  return (
                    <button
                      key={skillId}
                      type="button"
                      className={`skill-card ${isActive ? 'skill-card-active' : ''}`}
                      onClick={() => handleSkillClick(skillId)}
                      disabled={disabled}
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
              <div
                className="status-player"
                style={{ color: PLAYER_META[gameState.currentPlayer].accent }}
              >
                <span className={`player-dot ${gameState.currentPlayer}`} />
                {getPlayerNameByColor(gameState.currentPlayer)}
              </div>
              <p className="status-slogan">
                {PLAYER_META[gameState.currentPlayer].slogan}
              </p>
              <p className="status-message">{gameState.statusMessage}</p>
              {gameState.pendingSkill && (
                <p className="status-pending">
                  正在准备：{SKILL_META[gameState.pendingSkill].name} ·{' '}
                  {SKILL_META[gameState.pendingSkill].subtitle}
                </p>
              )}
            </div>
            <div className="scoreboard">
              <h2>玩家阵容</h2>
              <div className="score-row">
                <div className="score-label">
                  <span className="player-dot black" />
                  <span>
                    {getPlayerNameByColor('black')}
                    <span className="score-slogan">
                      {hostPlayer?.color === 'black' || guestPlayer?.color === 'black'
                        ? '执黑方'
                        : PLAYER_META.black.slogan}
                    </span>
                  </span>
                </div>
                <div className="score-value">{gameState.scores.black}</div>
              </div>
              <div className="score-row">
                <div className="score-label">
                  <span className="player-dot white" />
                  <span>
                    {getPlayerNameByColor('white')}
                    <span className="score-slogan">
                      {hostPlayer?.color === 'white' || guestPlayer?.color === 'white'
                        ? '执白方'
                        : PLAYER_META.white.slogan}
                    </span>
                  </span>
                </div>
                <div className="score-value">{gameState.scores.white}</div>
              </div>
              {localPlayer ? (
                <>
                  <button
                    type="button"
                    className="ready-button"
                    onClick={toggleReady}
                    disabled={readyDisabled}
                  >
                    {localPlayer.ready ? '取消就绪' : '我已就绪'}
                  </button>
                  {opponent ? (
                    <div className="ready-status">
                      对手状态：{opponent.ready ? '已就绪' : '待就绪'}
                    </div>
                  ) : (
                    <div className="ready-status">等待对手加入…</div>
                  )}
                </>
              ) : (
                <div className="ready-status">
                  {localSpectatorName
                    ? `${localSpectatorName} 正在旁观，享受这场综艺对局吧！`
                    : '旁观模式，可随时围观阵容。'}
                </div>
              )}
            </div>
            {spectators.length > 0 && (
              <div className="spectator-card">
                <h2>观众席</h2>
                <ul className="spectator-list">
                  {spectators.map((spectator) => (
                    <li key={spectator.id}>{spectator.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="info-card">
              <h2>玩法速记</h2>
              <ul className="info-list">
                <li>同屏双人轮流点击棋盘落子，先连成五子者获胜。</li>
                <li>点技能卡即时生效，飞沙走石需再点棋盘选定 3×3 中心。</li>
                <li>技能每局刷新一次，被吹走或倒流的棋子都会回收。</li>
                <li>双方点击“我已就绪”后，黑子自动先手开局。</li>
              </ul>
            </div>
            <button
              type="button"
              className="reset-button"
              onClick={handleResetGame}
              disabled={!canReset}
            >
              再开一局
            </button>
          </aside>
        </main>
      )}
    </div>
  )
}

function JoinForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [value, setValue] = useState('')

  return (
    <form
      className="join-form"
      onSubmit={(event) => {
        event.preventDefault()
        onJoin(value)
      }}
    >
      <input
        className="join-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={4}
        placeholder="输入 4 位邀请码"
      />
      <button type="submit" className="join-button">
        加入房间
      </button>
    </form>
  )
}

export default App
