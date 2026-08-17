import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { FateLadderRoom } from "./rooms/FateLadderRoom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  // Colyseus 游戏服务器
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  // 注册房间：4人匹配
  gameServer.define("fate_ladder", FateLadderRoom).enableRealtimeListing();

  // 静态文件服务（前端构建产物）
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "..", "dist", "public")
      : path.resolve(__dirname, "..", "client", "public");

  app.use(express.static(staticPath));

  // SPA 回退
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, () => {
    console.log(`🎲 命运阶梯服务器运行在 http://localhost:${port}`);
    console.log(`   WebSocket 端口: ${port}`);
    console.log(`   房间: fate_ladder (4人匹配)`);
  });
}

startServer().catch(console.error);
