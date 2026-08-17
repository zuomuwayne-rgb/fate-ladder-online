/**
 * 命运阶梯 · 在线多人版
 *
 * 改造说明：
 * - 原版4人同屏（A/B/C人类 + D AI），改为4个真实在线玩家
 * - 游戏状态由Colyseus服务器管理，客户端只负责渲染和发送操作
 * - 每个客户端只能操作自己的角色
 * - AI 玩家 D 保留（如果房间不满4人则由AI补位）
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { Room } from "colyseus.js";
import { ArrowDown, Bot, CircleHelp, Dices, LockKeyhole, RefreshCw, Trophy, X, Users, Loader2 } from "lucide-react";
import { getColyseusClient } from "@/services/colyseusClient";

type PlayerId = 0 | 1 | 2 | 3;
type Phase = "entry" | "turn" | "rolling" | "choice" | "settlement" | "finished";

// 这些类型与服务器 Schema 对应
interface PlayerData {
  id: number;
  label: string;
  name: string;
  role: string; // "human" | "ai"
  position: number;
  reward: number;
  rolls: number;
  locked: boolean;
  connected: boolean;
}

const MAX_ROLLS = 10;
const rewards = [2, 4, 6, 10, 15, 20, 30, 50, 80, 150, 220, 300, 420, 560, 720, 900, 1100, 1350, 1650, 2000];

export default function Home() {
  // 连接状态
  const [status, setStatus] = useState<"lobby" | "connecting" | "playing">("lobby");
  const [mySlot, setMySlot] = useState<PlayerId | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  // 游戏状态（从服务器同步）
  const [phase, setPhase] = useState<Phase>("entry");
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<number>(0);
  const [lastDice, setLastDice] = useState<(number | null)[]>([null, null, null, null]);
  const [dropCells, setDropCells] = useState<number[]>([]);
  const [collisionCells, setCollisionCells] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [winner, setWinner] = useState<number | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);

  // UI 状态（本地）
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{
    kind: string; title: string; detail: string;
    value?: number; seized?: number; prize?: number;
    targetPlayerId?: number; collidedWithId?: number;
  } | null>(null);

  const roomRef = useRef<Room | null>(null);
  const playerNameRef = useRef("");

  // 加入房间
  const joinRoom = useCallback(async (name: string) => {
    if (!name.trim()) return;
    playerNameRef.current = name.trim();
    setStatus("connecting");

    try {
      const client = getColyseusClient();
      const room = await client.joinOrCreate("fate_ladder", { name: name.trim() });
      roomRef.current = room;
      setRoomId(room.roomId);

      // 初始状态同步
      syncState(room);

      // 监听状态变化
      room.onStateChange(() => syncState(room));

      // 监听事件消息
      room.onMessage("event", (data) => {
        if (data.kind) {
          setResultModal(data);
        }
      });

      // 监听自己被分配的槽位
      room.onMessage("slot", (data) => {
        setMySlot(data.slot as PlayerId);
      });

      setStatus("playing");
    } catch (err) {
      console.error("加入房间失败:", err);
      setStatus("lobby");
    }
  }, []);

  // 从服务器 Schema 同步状态
  const syncState = useCallback((room: Room) => {
    const state = room.state;

    setPhase(state.phase as Phase);
    setCurrentPlayer(state.currentPlayerIndex);
    setNotice(state.message);
    setWinner(state.winnerId >= 0 ? state.winnerId : null);
    setConnectedCount(state.connectedCount);

    // 同步掉落点和碰撞格
    setDropCells(Array.from(state.dropCells).map(Number));
    setCollisionCells(Array.from(state.collisionCells).map(Number));

    // 同步骰子结果
    const diceArr: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      diceArr.push(state.diceResults[i] || null);
    }
    setLastDice(diceArr);

    // 同步玩家数据
    const playerArr: PlayerData[] = [];
    const labels = ["A", "B", "C", "D"];
    for (const label of labels) {
      const p = state.players.get(label);
      if (p) {
        playerArr.push({
          id: p.id,
          label: p.label,
          name: p.name,
          role: p.role,
          position: p.position,
          reward: p.reward,
          rolls: p.rolls,
          locked: p.locked,
          connected: p.connected,
        });
      }
    }
    // 按 id 排序
    playerArr.sort((a, b) => a.id - b.id);
    setPlayers(playerArr);
  }, []);

  // 发送操作指令
  const sendAction = useCallback((type: string, data?: any) => {
    roomRef.current?.send(type, data);
  }, []);

  // 关闭事件弹窗
  const closeResultModal = useCallback(() => {
    setResultModal(null);
    // 如果是 choice 阶段且是自己的回合，自动发送
    if (phase === "choice" && mySlot !== null && mySlot === currentPlayer) {
      // 弹窗关闭后玩家可以选择继续或锁定
    }
  }, [phase, mySlot, currentPlayer]);

  // 清理
  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  // 重新计算 revealedDrops（掉落点 + 碰撞格合并）
  const revealedDrops = Array.from(new Set([...dropCells, ...collisionCells])).sort((a, b) => a - b);

  const current = players[currentPlayer];
  const phaseLabel = phase === "entry" ? "准备" : phase === "turn" ? `${current?.label ?? "?"} 回合` : phase === "rolling" ? `${current?.label ?? "?"} 攀登中` : phase === "choice" ? `${current?.label ?? "?"} 选择` : phase === "settlement" ? "结算" : "结束";

  // 判断是否是我的回合
  const isMyTurn = mySlot !== null && mySlot === currentPlayer;
  const isMyChoice = mySlot !== null && mySlot === currentPlayer && phase === "choice";

  // --- 大厅界面 ---
  if (status === "lobby") {
    return (
      <main className="lobby-screen">
        <div className="lobby-card">
          <div className="lobby-logo">
            <img src="/assets/fate-ladder-logo.png" alt="命运阶梯" />
            <h1>命运阶梯</h1>
            <p>二十阶命运阶梯 · 四人在线对局</p>
          </div>
          <div className="lobby-form">
            <input
              type="text"
              placeholder="输入你的昵称..."
              maxLength={12}
              onKeyDown={(e) => e.key === "Enter" && joinRoom((e.target as HTMLInputElement).value)}
            />
            <button onClick={(e) => {
              const input = (e.target as HTMLElement).parentElement?.querySelector("input") as HTMLInputElement;
              if (input) joinRoom(input.value);
            }}>
              <Users size={18} />匹配对战
            </button>
          </div>
          <p className="lobby-hint">4人匹配，每人10次骰子，精准到达第20阶赢取终局奖池！</p>
        </div>
        <button className="rules-link" onClick={() => setRulesOpen(true)}>
          <CircleHelp size={16} />查看规则
        </button>
        {rulesOpen && (
          <div className="rules-overlay" role="dialog" aria-modal="true" aria-label="简要规则">
            <div className="quick-rules">
              <button onClick={() => setRulesOpen(false)} aria-label="关闭规则"><X size={20} /></button>
              <h2>简要规则</h2>
              <p>四人按 A → B → C → D 轮流掷骰子前进。</p>
              <p>每位参与者最多投掷 10 次。踩中掉落点清空奖励；相撞的两人回到起点。</p>
              <p>精准到达第 20 阶可赢取终局奖池 200 + 没收全场奖励！</p>
            </div>
          </div>
        )}
      </main>
    );
  }

  // --- 连接中 ---
  if (status === "connecting") {
    return (
      <main className="lobby-screen">
        <div className="lobby-card connecting-card">
          <Loader2 size={40} className="spinning" />
          <p>正在匹配对手...</p>
        </div>
      </main>
    );
  }

  // --- 游戏界面 ---
  const playerControl = (player: PlayerData) => {
    // AI玩家（房间不满时的补位）
    if (player.role === "ai") {
      return (
        <div className="ai-control">
          <Bot size={16} />
          <span>{phase === "rolling" && currentPlayer === player.id ? "AI 攀登中" : "AI 自动行动"}</span>
        </div>
      );
    }

    // 不在线的玩家
    if (!player.connected) {
      return <div className="ai-control"><span>等待加入...</span></div>;
    }

    // 自己的回合 - 掷骰
    if (phase === "turn" && player.id === currentPlayer) {
      const isActive = player.id === mySlot && !player.locked && player.rolls < MAX_ROLLS;
      return (
        <button
          className={`roll-button ${isActive ? "is-active" : ""}`}
          disabled={!isActive}
          onClick={() => sendAction("rollDice")}
        >
          <Dices size={16} />
          {isActive ? `投掷 ${player.rolls}/${MAX_ROLLS}` : phase === "rolling" ? "攀登中" : "等待..."}
        </button>
      );
    }

    // 选择阶段 - 继续/锁定
    if (phase === "choice" && player.id === currentPlayer) {
      const isMyChoiceHere = player.id === mySlot;
      if (isMyChoiceHere) {
        return (
          <div className="choice-actions">
            <button onClick={() => sendAction("continue")}>继续</button>
            <button onClick={() => sendAction("lockReward")}>锁定</button>
          </div>
        );
      }
      return <div className="ai-control"><span>思考中...</span></div>;
    }

    // 其他情况
    return (
      <button className="roll-button" disabled>
        <Dices size={16} />
        {player.rolls}/{MAX_ROLLS}
      </button>
    );
  };

  const playerCard = (player: PlayerData) => {
    const isMe = player.id === mySlot;
    return (
      <article
        className={`player-side player-${player.label.toLowerCase()} ${currentPlayer === player.id && phase !== "finished" ? "is-current" : ""} ${isMe ? "is-me" : ""}`}
        key={player.id}
      >
        <div className="player-top">
          <span className="player-letter">{player.label}</span>
          <div>
            <small>{player.role === "ai" ? "自动参与者" : isMe ? "你" : "玩家"}{!player.connected && player.role !== "ai" ? " · 离线" : ""}</small>
            <h2>{player.name}{isMe ? " (我)" : ""}</h2>
          </div>
        </div>
        <div className="player-stats">
          <div><span>位置</span><strong>{player.position}<small>阶</small></strong></div>
          <div><span>奖励</span><strong>+{player.reward}</strong></div>
        </div>
        <div className="roll-meter">
          <span>骰子</span>
          <b>{player.rolls} / {MAX_ROLLS}</b>
          <i><em style={{ width: `${player.rolls * 10}%` }} /></i>
        </div>
        <div className="last-dice">{lastDice[player.id] ?? "—"}</div>
        {playerControl(player)}
        {player.locked && <p className="locked-note"><LockKeyhole size={12} />已锁定</p>}
      </article>
    );
  };

  return (
    <main className="four-game">
      <header className="simple-header">
        <div className="mini-brand">
          <img src="/assets/fate-ladder-logo.png" alt="命运阶梯" />
          <h1>命运阶梯</h1>
        </div>
        <div className="header-center">
          <span>终局奖池</span>
          <b>200</b>
        </div>
        <div className="header-right">
          <span className="online-count">{connectedCount}/4 在线</span>
          <button className="rules-button" onClick={() => setRulesOpen(true)} aria-label="查看简要规则">
            <CircleHelp size={19} />
          </button>
        </div>
      </header>

      <section className="four-stage">
        <div className="side-stack left-stack">
          {players[0] && playerCard(players[0])}
          {players[1] && playerCard(players[1])}
        </div>
        <section className="center-ladder" aria-label="二十阶命运阶梯">
          <div className="stage-status">
            <span>{phaseLabel}</span>
            <p>{notice}</p>
          </div>
          <div className="ladder-frame">
            <img src="/assets/fate-ladder-path.jpg" alt="" className="center-art" />
            <div className="stairs">
              {Array.from({ length: 20 }, (_, index) => 20 - index).map((level) => {
                const inLevel = players.filter((player) => player.position === level);
                const leftTokens = inLevel.filter((player) => player.id < 2);
                const rightTokens = inLevel.filter((player) => player.id >= 2);
                const danger = revealedDrops.includes(level);
                return (
                  <div className={`single-step ${level === 20 ? "is-top" : ""} ${danger ? "is-danger" : ""}`} key={level}>
                    <div className="token-slot left">
                      {leftTokens.map((player) => (
                        <span
                          className={`board-token token-${player.label.toLowerCase()} ${phase === "rolling" && currentPlayer === player.id ? "is-climbing" : ""}`}
                          key={`${player.label}-${player.position}`}
                        >
                          {player.label}
                        </span>
                      ))}
                    </div>
                    <span className="step-number">{level}</span>
                    <span className="step-reward">
                      {level === 20 ? <Trophy size={14} /> : danger ? <ArrowDown size={14} /> : `+${rewards[level - 1]}`}
                    </span>
                    <div className="token-slot right">
                      {rightTokens.map((player) => (
                        <span
                          className={`board-token token-${player.label.toLowerCase()} ${phase === "rolling" && currentPlayer === player.id ? "is-climbing" : ""}`}
                          key={`${player.label}-${player.position}`}
                        >
                          {player.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="ladder-foot">
            <span>START</span>
            <span>精准到 20 获得奖池</span>
          </div>
        </section>
        <div className="side-stack right-stack">
          {players[2] && playerCard(players[2])}
          {players[3] && playerCard(players[3])}
        </div>
      </section>

      <footer className="stage-footer">
        {phase === "entry" && connectedCount >= 4 && (
          <button className="start-button" onClick={() => sendAction("startGame")}>
            开始四人对局
          </button>
        )}
        {phase === "entry" && connectedCount < 4 && (
          <span>等待玩家加入... ({connectedCount}/4)</span>
        )}
        {phase === "settlement" && (
          <button className="start-button" onClick={() => sendAction("settle")}>
            <Trophy size={18} />结算奖励
          </button>
        )}
        {phase === "finished" && (
          <div className="final-row">
            <strong>{winner !== null && winner >= 0 ? `${players[winner]?.name} 赢得终局奖池` : "本局已结算"}</strong>
            <button className="start-button" onClick={() => sendAction("restart")}>
              <RefreshCw size={17} />再来一局
            </button>
          </div>
        )}
        {(phase === "turn" || phase === "rolling") && (
          <span>{current?.role === "ai" ? "命运 AI 正在判断…" : isMyTurn ? "轮到你掷骰子！" : `等待 ${current?.name ?? "?"} 操作...`}</span>
        )}
        {phase === "choice" && (
          <span>{isMyChoice ? "选择继续冒险或锁定奖励" : `等待 ${current?.name ?? "?"} 决策...`}</span>
        )}
      </footer>

      {rulesOpen && (
        <div className="rules-overlay" role="dialog" aria-modal="true" aria-label="简要规则">
          <div className="quick-rules">
            <button onClick={() => setRulesOpen(false)} aria-label="关闭规则"><X size={20} /></button>
            <h2>简要规则</h2>
            <p>四人按 A → B → C → D 轮流掷骰子前进。如人数不足，AI 自动补位。</p>
            <p>每位参与者最多投掷 10 次。踩中掉落点清空奖励；相撞的两人回到起点。</p>
            <p>精准到达第 20 阶可赢取终局奖池 200 + 没收全场奖励！</p>
          </div>
        </div>
      )}

      {resultModal && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label="本次落点结果">
          <div className={`result-modal result-${resultModal.kind}`}>
            {resultModal.kind === "victory" && <div className="victory-rays" aria-hidden="true" />}
            <div className="result-mark">
              {resultModal.kind === "gain" || resultModal.kind === "victory"
                ? <Trophy size={27} />
                : <ArrowDown size={29} />}
            </div>
            <p>{resultModal.title}</p>
            {typeof resultModal.value === "number" && (
              <strong>
                {resultModal.kind === "gain" || resultModal.kind === "victory" ? "+" : "−"}{resultModal.value}
              </strong>
            )}
            {resultModal.kind === "victory" && (
              <div className="victory-breakdown">
                <span>终局奖池 <b>+{resultModal.prize}</b></span>
                <span>没收全场 <b>+{resultModal.seized}</b></span>
              </div>
            )}
            <span>{resultModal.detail}</span>
            <button onClick={closeResultModal}>
              {resultModal.kind === "victory" ? "收下全场奖励" : "继续"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
