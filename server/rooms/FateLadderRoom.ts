import { Room, Client } from "colyseus";
import { FateLadderState } from "../schema/FateLadderState";
import { PlayerSchema } from "../schema/FateLadderState";
import {
  REWARDS, MAX_ROLLS, FINAL_PRIZE,
  PLAYER_LABELS, generateDropCells, canAct,
} from "../constants";

export class FateLadderRoom extends Room<FateLadderState> {
  private sessionIdToSlot = new Map<string, number>();
  private turnTimeout: NodeJS.Timeout | null = null;
  private aiTimeout: NodeJS.Timeout | null = null;
  private isProcessing = false;

  maxClients = 4;

  onCreate() {
    this.setState(new FateLadderState());
    this.initDropCells();
    this.initPlayers();
    this.initDiceResults();
    this.registerMessages();
  }

  private initDropCells() {
    const drops = generateDropCells();
    for (const d of drops) this.state.dropCells.push(String(d));
  }

  private initPlayers() {
    for (let i = 0; i < 4; i++) {
      const label = PLAYER_LABELS[i];
      this.state.players.set(label, new PlayerSchema(i, label, `玩家 ${label}`, "human"));
    }
  }

  private initDiceResults() {
    for (let i = 0; i < 4; i++) this.state.diceResults.push(0);
  }

  onJoin(client: Client, options?: any) {
    const slotIndex = this.findAvailableSlot();
    if (slotIndex === -1) { client.leave(); return; }

    const label = PLAYER_LABELS[slotIndex];
    this.sessionIdToSlot.set(client.sessionId, slotIndex);

    const player = this.state.players.get(label)!;
    player.connected = true;
    player.name = options?.name || `玩家 ${label}`;

    this.state.connectedCount++;
    this.state.message = `等待玩家加入... (${this.state.connectedCount}/4)`;

    // 告诉客户端分配的槽位
    client.send("slot", { slot: slotIndex });
  }

  onLeave(client: Client) {
    const slotIndex = this.sessionIdToSlot.get(client.sessionId);
    if (slotIndex !== undefined) {
      const label = PLAYER_LABELS[slotIndex];
      const player = this.state.players.get(label)!;
      player.connected = false;

      if (this.state.phase === "entry") {
        this.state.connectedCount--;
        this.state.message = `等待玩家加入... (${this.state.connectedCount}/4)`;
      }
    }
    this.sessionIdToSlot.delete(client.sessionId);
  }

  onDispose() {
    this.clearTimers();
  }

  // --- 消息处理 ---
  private registerMessages() {
    this.onMessage("startGame", () => this.handleStartGame());
    this.onMessage("rollDice", (client) => this.handleRollDice(client));
    this.onMessage("continue", (client) => this.handleContinue(client));
    this.onMessage("lockReward", (client) => this.handleLockReward(client));
    this.onMessage("settle", () => this.handleSettle());
    this.onMessage("restart", () => this.handleRestart());
  }

  private isCurrentPlayer(client: Client): boolean {
    const slot = this.sessionIdToSlot.get(client.sessionId);
    return slot !== undefined && slot === this.state.currentPlayerIndex;
  }

  private handleStartGame() {
    if (this.state.phase !== "entry" || this.state.connectedCount < 4) return;
    this.state.phase = "turn";
    this.state.currentPlayerIndex = 0;
    this.state.message = "A 先投掷。每位参与者各有 10 次骰子。";
    this.clearEvent();
    this.scheduleAiTurn();
  }

  private handleRollDice(client: Client) {
    if (this.state.phase !== "turn" || this.isProcessing) return;
    if (!this.isCurrentPlayer(client)) return;

    const player = this.getCurrentPlayer();
    if (!player || !canAct(player.rolls, player.locked)) return;

    this.executeRoll(player);
  }

  private executeRoll(player: PlayerSchema) {
    this.state.phase = "rolling";
    this.clearEvent();

    const dice = Math.floor(Math.random() * 6) + 1;
    player.rolls++;
    this.state.diceResults.set(player.id, dice);

    const newPos = player.position + dice;
    const animDelay = this.calcAnimDelay(player.position, newPos);

    this.clearTimers();
    this.turnTimeout = setTimeout(() => {
      this.resolveMove(player, dice);
    }, animDelay);
  }

  private calcAnimDelay(from: number, to: number): number {
    const base = 350;
    const step = 145;
    const steps = to > 20 ? (20 - from) + 1 : Math.max(to - from, 1);
    return base + steps * step + 200;
  }

  private resolveMove(player: PlayerSchema, dice: number) {
    this.isProcessing = true;
    const newPos = player.position + dice;

    if (newPos > 20) {
      player.position = 1;
      this.showEvent("overstep", "超过阶顶",
        `${player.name} 无法精准停在第 20 阶，回到第 1 阶。`, player.id);
      this.state.phase = "choice";
      this.broadcastEvent();
      this.isProcessing = false;
      this.scheduleAiChoice();

    } else if (newPos === 20) {
      player.position = 20;
      let seized = 0;
      for (const [, p] of this.state.players) {
        if (p.id !== player.id) seized += p.reward;
      }
      const total = FINAL_PRIZE + player.reward + seized;
      player.reward = total;
      player.locked = true;
      for (const [, p] of this.state.players) {
        if (p.id !== player.id) { p.reward = 0; p.locked = true; }
      }
      this.state.winnerId = player.id;
      this.state.phase = "finished";
      this.state.message = `${player.name} 精准抵达第 20 阶，夺取全场 ${total} 枚奖励！`;
      this.showEvent("victory", "全场通杀",
        `${player.name} 精准登顶，其他参与者的累计奖励已全部没收。`,
        player.id, total, seized, FINAL_PRIZE);
      this.broadcastEvent();
      this.isProcessing = false;

    } else {
      const collided = this.findPlayerAt(newPos, player.id);
      if (collided) {
        player.position = 1;
        collided.position = 1;
        const posStr = String(newPos);
        if (!Array.from(this.state.collisionCells).includes(posStr)) {
          this.state.collisionCells.push(posStr);
        }
        this.showEvent("collision", "阶梯坠落",
          `${player.name} 与 ${collided.name} 相撞，均回到第 1 阶。`,
          player.id, 0, 0, 0, collided.id);
        this.state.phase = "choice";
        this.broadcastEvent();
        this.isProcessing = false;
        this.scheduleAiChoice();

      } else if (Array.from(this.state.dropCells).map(Number).includes(newPos)) {
        player.position = newPos;
        const lost = player.reward;
        player.reward = 0;
        this.showEvent("loss", "踩中掉落点",
          lost > 0 ? `${player.name} 失去 ${lost} 枚累计筹码。` : `${player.name} 没有累计筹码可失去。`,
          player.id, lost);
        this.state.phase = "choice";
        this.broadcastEvent();
        this.isProcessing = false;
        this.scheduleAiChoice();

      } else {
        player.position = newPos;
        const gain = REWARDS[newPos - 1];
        player.reward += gain;
        this.showEvent("gain", "获得筹码",
          `${player.name} 在第 ${newPos} 阶获得筹码。`, player.id, gain);
        this.state.phase = "choice";
        this.broadcastEvent();
        this.isProcessing = false;
        this.scheduleAiChoice();
      }
    }
  }

  private handleContinue(client: Client) {
    if (this.state.phase !== "choice" || !this.isCurrentPlayer(client)) return;
    this.clearEvent();
    this.broadcastEvent();
    this.advanceTurn();
  }

  private handleLockReward(client: Client) {
    if (this.state.phase !== "choice" || !this.isCurrentPlayer(client)) return;
    const player = this.getCurrentPlayer();
    if (!player) return;

    player.locked = true;
    this.state.message = `${player.name} 已锁定 ${player.reward} 枚筹码。`;
    this.clearEvent();
    this.broadcastEvent();
    this.advanceTurn();
  }

  private handleSettle() {
    if (this.state.phase !== "settlement") return;
    let maxReward = -1, winner: PlayerSchema | null = null;
    for (const [, p] of this.state.players) {
      if (p.reward > maxReward) { maxReward = p.reward; winner = p; }
    }
    this.state.phase = "finished";
    if (winner && maxReward > 0) {
      this.state.winnerId = winner.id;
      this.state.message = `本局结束！${winner.name} 以 ${winner.reward} 枚筹码获胜！`;
    } else {
      this.state.message = "本局结束，无人获得奖励。";
    }
  }

  private handleRestart() {
    this.clearTimers();
    for (let i = 0; i < 4; i++) {
      const p = this.getPlayerByIndex(i);
      if (p) { p.position = 1; p.reward = 0; p.rolls = 0; p.locked = false; }
    }
    this.state.dropCells.clear();
    const drops = generateDropCells();
    for (const d of drops) this.state.dropCells.push(String(d));
    this.state.collisionCells.clear();
    this.state.winnerId = -1;
    this.clearEvent();
    this.state.phase = "turn";
    this.state.currentPlayerIndex = 0;
    this.state.message = "新一局开始！A 先投掷。每位参与者各有 10 次骰子。";
    for (let i = 0; i < 4; i++) this.state.diceResults.set(i, 0);
    this.isProcessing = false;
    this.scheduleAiTurn();
  }

  // --- 事件弹窗 ---
  private showEvent(kind: string, title: string, detail: string,
    targetId: number, value = 0, seized = 0, prize = 0, collidedId = -1) {
    this.state.eventKind = kind;
    this.state.eventTitle = title;
    this.state.eventDetail = detail;
    this.state.eventTargetPlayerId = targetId;
    this.state.eventValue = value;
    this.state.eventSeized = seized;
    this.state.eventPrize = prize;
    this.state.eventCollidedWithId = collidedId;
  }

  private clearEvent() {
    this.state.eventKind = "";
    this.state.eventTitle = "";
    this.state.eventDetail = "";
  }

  private broadcastEvent() {
    // Colyseus Schema changes are automatically broadcast via onStateChange
    // But we also send a direct message for immediate UI response
    const ev = {
      kind: this.state.eventKind,
      title: this.state.eventTitle,
      detail: this.state.eventDetail,
      value: this.state.eventValue,
      seized: this.state.eventSeized,
      prize: this.state.eventPrize,
      targetPlayerId: this.state.eventTargetPlayerId,
      collidedWithId: this.state.eventCollidedWithId,
    };
    if (ev.kind) this.broadcast("event", ev);
  }

  // --- 回合管理 ---
  private advanceTurn() {
    const next = this.findNextActive();
    if (next === -1) {
      this.state.phase = "settlement";
      this.state.message = "所有参与者都已锁定奖励或用尽骰子，进入结算。";
      return;
    }
    this.state.currentPlayerIndex = next;
    this.state.phase = "turn";
    const p = this.getPlayerByIndex(next);
    if (p) this.state.message = `轮到 ${p.name} 投掷。`;
    this.scheduleAiTurn();
  }

  private findNextActive(): number {
    const start = (this.state.currentPlayerIndex + 1) % 4;
    for (let i = 0; i < 4; i++) {
      const idx = (start + i) % 4;
      const p = this.getPlayerByIndex(idx);
      if (p && canAct(p.rolls, p.locked)) return idx;
    }
    return -1;
  }

  // --- 辅助方法 ---
  private getCurrentPlayer(): PlayerSchema | null {
    return this.getPlayerByIndex(this.state.currentPlayerIndex);
  }

  private getPlayerByIndex(idx: number): PlayerSchema | null {
    for (const [, p] of this.state.players) {
      if (p.id === idx) return p;
    }
    return null;
  }

  private findAvailableSlot(): number {
    for (let i = 0; i < 4; i++) {
      const label = PLAYER_LABELS[i];
      const p = this.state.players.get(label)!;
      if (!p.connected) return i;
    }
    return -1;
  }

  private findPlayerAt(pos: number, excludeId: number): PlayerSchema | null {
    for (const [, p] of this.state.players) {
      if (p.id !== excludeId && p.position === pos) return p;
    }
    return null;
  }

  private clearTimers() {
    if (this.turnTimeout) { clearTimeout(this.turnTimeout); this.turnTimeout = null; }
    if (this.aiTimeout) { clearTimeout(this.aiTimeout); this.aiTimeout = null; }
  }

  // AI目前保留但在线版4人都是真人，暂不启用
  // 如果未来需要AI补位可以取消注释
  /*
  private scheduleAiTurn() {
    const player = this.getCurrentPlayer();
    if (!player || player.role !== "ai" || this.state.phase !== "turn") return;
    this.clearTimers();
    this.aiTimeout = setTimeout(() => {
      if (this.state.phase === "turn") this.executeRoll(player);
    }, 650);
  }

  private scheduleAiChoice() {
    const player = this.getCurrentPlayer();
    if (!player || player.role !== "ai" || this.state.phase !== "choice") return;
    this.clearTimers();
    this.aiTimeout = setTimeout(() => {
      if (this.state.phase === "choice" && this.getCurrentPlayer()?.id === player.id) {
        if (player.reward >= 160 || player.rolls >= 9) {
          player.locked = true;
          this.state.message = `${player.name} 已锁定 ${player.reward} 枚筹码。`;
        }
        this.clearEvent();
        this.broadcastEvent();
        this.advanceTurn();
      }
    }, 500);
  }
  */

  private scheduleAiTurn() { /* 在线版暂不启用AI */ }
  private scheduleAiChoice() { /* 在线版暂不启用AI */ }
}
