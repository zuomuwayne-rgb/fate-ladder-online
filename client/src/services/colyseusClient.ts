import { Client } from "colyseus.js";

// Colyseus 客户端连接管理
// 在生产环境中指向服务器地址，开发环境使用本地地址

const getWsEndpoint = () => {
  // 优先使用环境变量
  if (import.meta.env.VITE_COLYSEUS_URL) {
    return import.meta.env.VITE_COLYSEUS_URL;
  }
  // 默认使用当前域名（假设同源部署或反向代理）
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
};

let clientInstance: Client | null = null;

export function getColyseusClient(): Client {
  if (!clientInstance) {
    clientInstance = new Client(getWsEndpoint());
  }
  return clientInstance;
}

export function disconnectColyseus() {
  if (clientInstance) {
    clientInstance.removeAllListeners();
    clientInstance = null;
  }
}
