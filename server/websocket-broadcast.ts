import WebSocket from "ws";

const wsClients = new Set<WebSocket>();

export function addWebSocketClient(client: WebSocket) {
  wsClients.add(client);
}

export function removeWebSocketClient(client: WebSocket) {
  wsClients.delete(client);
}

export function broadcastToClients(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function getWebSocketClients() {
  return wsClients;
}
