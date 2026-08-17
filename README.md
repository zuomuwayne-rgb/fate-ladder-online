# 命运阶梯 · 在线多人版

二十阶命运阶梯，4人在线匹配对战！

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发环境（前端 + 后端同时）
npm run dev:full
```

打开 http://localhost:5173 即可进入大厅。

## 项目结构

```
client/              # React 前端
  src/
    pages/Home.tsx    # 游戏主界面 + 匹配大厅
    services/
      colyseusClient.ts  # Colyseus 客户端连接
    index.css          # 游戏样式
    public/assets/     # 图片资源
server/              # Colyseus 游戏服务器
  index.ts            # 服务器入口
  rooms/
    FateLadderRoom.ts # 游戏房间逻辑
  schema/
    FateLadderState.ts # 游戏状态 Schema
  constants.ts        # 游戏常量
```

## 游戏规则

1. 4人按 A→B→C→D 轮流掷骰子
2. 每人最多 10 次骰子
3. 掷骰后前进对应步数，踩到格子获得奖励
4. 踩到掉落点：奖励清零
5. 碰撞：双方回到起点（奖励保留）
6. 超过 20 阶：回到起点
7. 精准到达第 20 阶：赢取终局奖池 200 + 没收全场

## 部署

### 前端（GitHub Pages）
```bash
npm run build
# 将 client/dist 上传到 GitHub Pages
```

### 后端（Colyseus Cloud 或 Railway）
```bash
npm run build:server
# 部署到 Railway / Render / fly.io
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_COLYSEUS_URL` | WebSocket 服务器地址 | `ws://localhost:3000` |
| `PORT` | 服务器端口 | `3000` |

## 技术栈

- **前端**: React 19 + Tailwind 4 + Lucide Icons
- **后端**: Colyseus 0.15 + Express + WebSocket
- **部署**: GitHub Pages + Railway/Render
