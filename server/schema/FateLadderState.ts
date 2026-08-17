import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("number") id: number = 0;
  @type("string") label: string = "A";
  @type("string") name: string = "";
  @type("string") role: string = "human";
  @type("number") position: number = 1;
  @type("number") reward: number = 0;
  @type("number") rolls: number = 0;
  @type("boolean") locked: boolean = false;
  @type("boolean") connected: boolean = false;
  @type("number") sessionId: number = -1;

  constructor(id: number, label: string, name: string, role: string) {
    super();
    this.id = id;
    this.label = label;
    this.name = name;
    this.role = role;
  }
}

export class FateLadderState extends Schema {
  @type("string") phase: string = "entry";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type("number") currentPlayerIndex: number = 0;
  @type({ array: "string" }) dropCells = new ArraySchema<string>();
  @type({ array: "string" }) collisionCells = new ArraySchema<string>();
  @type("string") message: string = "";
  @type("number") winnerId: number = -1;
  @type({ array: "number" }) diceResults = new ArraySchema<number>();
  @type("number") requiredPlayers: number = 4;
  @type("number") connectedCount: number = 0;

  // 事件弹窗数据
  @type("string") eventKind: string = "";
  @type("string") eventTitle: string = "";
  @type("string") eventDetail: string = "";
  @type("number") eventValue: number = 0;
  @type("number") eventSeized: number = 0;
  @type("number") eventPrize: number = 0;
  @type("number") eventTargetPlayerId: number = -1;
  @type("number") eventCollidedWithId: number = -1;
}
