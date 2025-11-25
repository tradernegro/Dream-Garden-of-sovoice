import { useState, useEffect, useRef, useCallback } from 'react';

export interface TranscriptEntry {
  speaker: "user" | "assistant";
  text: string;
  timestamp: string;
}

export function useLiveTranscript(callId: string | null) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!callId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('[LiveTranscript] WebSocket connected');
      setIsConnected(true);
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.event === 'transcript:update' && message.data?.callId === callId) {
          setTranscripts(prev => [...prev, {
            speaker: message.data.speaker,
            text: message.data.text,
            timestamp: message.data.timestamp
          }]);
        }
      } catch (error) {
        console.error('[LiveTranscript] Message parse error:', error);
      }
    };

    ws.current.onerror = (error) => {
      console.error('[LiveTranscript] WebSocket error:', error);
      setIsConnected(false);
    };

    ws.current.onclose = () => {
      console.log('[LiveTranscript] WebSocket disconnected, reconnecting...');
      setIsConnected(false);
      reconnectTimeout.current = setTimeout(connect, 3000);
    };
  }, [callId]);

  useEffect(() => {
    if (callId) {
      setTranscripts([]);
      connect();
    }

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [callId, connect]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return { transcripts, isConnected, clearTranscripts };
}
