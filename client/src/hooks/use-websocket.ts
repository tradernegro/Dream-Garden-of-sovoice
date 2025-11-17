import { useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';

type WebSocketEvent = {
  event: string;
  data: any;
};

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketEvent = JSON.parse(event.data);
        
        // Handle different event types
        switch (message.event) {
          case 'call:created':
          case 'call:updated':
          case 'call:deleted':
            // Invalidate calls queries to refetch data
            queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
            if (message.data?.id) {
              queryClient.invalidateQueries({ queryKey: ['/api/calls', message.data.id] });
            }
            break;
          case 'agent:created':
          case 'agent:updated':
          case 'agent:deleted':
            queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
            if (message.data?.id) {
              queryClient.invalidateQueries({ queryKey: ['/api/agents', message.data.id] });
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      reconnectTimeout.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  return ws.current;
}
