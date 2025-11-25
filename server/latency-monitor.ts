/**
 * Latency Monitoring System - Tracks every millisecond like NLPearl
 * 
 * Monitors:
 * - STT Latency (Speech-to-Text)
 * - LLM First Token Time (TTFT)
 * - TTS First Byte Latency
 * - Turn-Taking Delay (Mouth-to-Ear)
 * - Interrupt Handling Time
 * - Network Hop Delays
 */

export interface LatencyMetric {
  timestamp: Date;
  callId: string;
  metricType: MetricType;
  valueMs: number;
  details?: Record<string, any>;
}

export type MetricType = 
  | "stt_latency"           // Time from audio to text
  | "llm_first_token"       // Time to first LLM token
  | "llm_total"             // Total LLM response time
  | "tts_first_byte"        // Time to first audio byte
  | "tts_total"             // Total TTS time
  | "turn_taking"           // Mouth-to-ear delay
  | "interrupt_handling"    // Time to stop on interrupt
  | "prefetch_time"         // Data prefetch duration
  | "cache_lookup"          // Cache hit/miss time
  | "network_hop"           // Network delay
  | "total_response";       // End-to-end response time

export interface CallMetrics {
  callId: string;
  startTime: Date;
  metrics: LatencyMetric[];
  
  // Aggregated stats
  avgSTTLatency: number;
  avgLLMFirstToken: number;
  avgTTSFirstByte: number;
  avgTurnTaking: number;
  avgTotalResponse: number;
  
  // Counts
  totalInterrupts: number;
  cacheHits: number;
  cacheMisses: number;
}

interface GlobalStats {
  totalCalls: number;
  totalMetrics: number;
  avgSTTLatency: number;
  avgLLMFirstToken: number;
  avgTTSFirstByte: number;
  avgTurnTaking: number;
  avgTotalResponse: number;
  
  // Performance targets
  sttTarget: number;        // < 300ms
  llmTarget: number;        // < 350ms
  ttsTarget: number;        // < 150ms
  turnTakingTarget: number; // < 1000ms
  
  // How often we meet targets (%)
  sttTargetRate: number;
  llmTargetRate: number;
  ttsTargetRate: number;
  turnTakingTargetRate: number;
}

class LatencyMonitor {
  private callMetrics: Map<string, CallMetrics> = new Map();
  private allMetrics: LatencyMetric[] = [];
  
  // NLPearl-level targets (in ms)
  private readonly TARGETS = {
    stt_latency: 300,
    llm_first_token: 350,
    tts_first_byte: 150,
    turn_taking: 1000,
    interrupt_handling: 150,
    total_response: 800
  };

  /**
   * Start tracking a new call
   */
  startCall(callId: string): void {
    this.callMetrics.set(callId, {
      callId,
      startTime: new Date(),
      metrics: [],
      avgSTTLatency: 0,
      avgLLMFirstToken: 0,
      avgTTSFirstByte: 0,
      avgTurnTaking: 0,
      avgTotalResponse: 0,
      totalInterrupts: 0,
      cacheHits: 0,
      cacheMisses: 0
    });
    console.log(`[Latency] Started monitoring call ${callId}`);
  }

  /**
   * Record a latency metric
   */
  record(
    callId: string, 
    metricType: MetricType, 
    valueMs: number,
    details?: Record<string, any>
  ): void {
    const metric: LatencyMetric = {
      timestamp: new Date(),
      callId,
      metricType,
      valueMs,
      details
    };

    // Add to call-specific metrics
    const callData = this.callMetrics.get(callId);
    if (callData) {
      callData.metrics.push(metric);
      this.updateCallAverages(callData);
    }

    // Add to global metrics (keep last 10000)
    this.allMetrics.push(metric);
    if (this.allMetrics.length > 10000) {
      this.allMetrics = this.allMetrics.slice(-10000);
    }

    // Log if exceeds target
    const target = this.TARGETS[metricType as keyof typeof this.TARGETS];
    const status = target && valueMs > target ? "⚠️ SLOW" : "✓";
    console.log(`[Latency] ${callId.slice(0, 8)} ${metricType}: ${valueMs}ms ${status}`);
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(callId: string): void {
    const callData = this.callMetrics.get(callId);
    if (callData) {
      callData.cacheHits++;
    }
    this.record(callId, "cache_lookup", 0, { hit: true });
  }

  recordCacheMiss(callId: string, lookupTimeMs: number): void {
    const callData = this.callMetrics.get(callId);
    if (callData) {
      callData.cacheMisses++;
    }
    this.record(callId, "cache_lookup", lookupTimeMs, { hit: false });
  }

  /**
   * Record an interrupt
   */
  recordInterrupt(callId: string, responseTimeMs: number): void {
    const callData = this.callMetrics.get(callId);
    if (callData) {
      callData.totalInterrupts++;
    }
    this.record(callId, "interrupt_handling", responseTimeMs);
  }

  /**
   * Get metrics for a specific call
   */
  getCallMetrics(callId: string): CallMetrics | null {
    return this.callMetrics.get(callId) || null;
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): GlobalStats {
    const sttMetrics = this.allMetrics.filter(m => m.metricType === "stt_latency");
    const llmMetrics = this.allMetrics.filter(m => m.metricType === "llm_first_token");
    const ttsMetrics = this.allMetrics.filter(m => m.metricType === "tts_first_byte");
    const turnMetrics = this.allMetrics.filter(m => m.metricType === "turn_taking");
    const totalMetrics = this.allMetrics.filter(m => m.metricType === "total_response");

    const avg = (metrics: LatencyMetric[]) => 
      metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.valueMs, 0) / metrics.length : 0;

    const targetRate = (metrics: LatencyMetric[], target: number) =>
      metrics.length > 0 ? (metrics.filter(m => m.valueMs <= target).length / metrics.length) * 100 : 0;

    return {
      totalCalls: this.callMetrics.size,
      totalMetrics: this.allMetrics.length,
      avgSTTLatency: Math.round(avg(sttMetrics)),
      avgLLMFirstToken: Math.round(avg(llmMetrics)),
      avgTTSFirstByte: Math.round(avg(ttsMetrics)),
      avgTurnTaking: Math.round(avg(turnMetrics)),
      avgTotalResponse: Math.round(avg(totalMetrics)),
      
      sttTarget: this.TARGETS.stt_latency,
      llmTarget: this.TARGETS.llm_first_token,
      ttsTarget: this.TARGETS.tts_first_byte,
      turnTakingTarget: this.TARGETS.turn_taking,
      
      sttTargetRate: Math.round(targetRate(sttMetrics, this.TARGETS.stt_latency)),
      llmTargetRate: Math.round(targetRate(llmMetrics, this.TARGETS.llm_first_token)),
      ttsTargetRate: Math.round(targetRate(ttsMetrics, this.TARGETS.tts_first_byte)),
      turnTakingTargetRate: Math.round(targetRate(turnMetrics, this.TARGETS.turn_taking))
    };
  }

  /**
   * Get recent metrics for dashboard
   */
  getRecentMetrics(limit: number = 100): LatencyMetric[] {
    return this.allMetrics.slice(-limit);
  }

  /**
   * Get metrics by type for analysis
   */
  getMetricsByType(metricType: MetricType, limit: number = 100): LatencyMetric[] {
    return this.allMetrics
      .filter(m => m.metricType === metricType)
      .slice(-limit);
  }

  /**
   * End call monitoring
   */
  endCall(callId: string): CallMetrics | null {
    const callData = this.callMetrics.get(callId);
    if (callData) {
      console.log(`[Latency] Call ${callId} ended. Stats:`, {
        avgSTT: `${callData.avgSTTLatency}ms`,
        avgLLM: `${callData.avgLLMFirstToken}ms`,
        avgTTS: `${callData.avgTTSFirstByte}ms`,
        avgTurnTaking: `${callData.avgTurnTaking}ms`,
        interrupts: callData.totalInterrupts,
        cacheHitRate: callData.cacheHits + callData.cacheMisses > 0 
          ? `${Math.round(callData.cacheHits / (callData.cacheHits + callData.cacheMisses) * 100)}%`
          : "N/A"
      });
    }
    return callData || null;
  }

  /**
   * Clear old metrics (keep last hour)
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.allMetrics = this.allMetrics.filter(m => m.timestamp > oneHourAgo);
    
    // Clear old call data
    for (const [callId, data] of this.callMetrics.entries()) {
      if (data.startTime < oneHourAgo) {
        this.callMetrics.delete(callId);
      }
    }
  }

  private updateCallAverages(callData: CallMetrics): void {
    const byType = (type: MetricType) => 
      callData.metrics.filter(m => m.metricType === type);
    
    const avg = (metrics: LatencyMetric[]) =>
      metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + m.valueMs, 0) / metrics.length) : 0;

    callData.avgSTTLatency = avg(byType("stt_latency"));
    callData.avgLLMFirstToken = avg(byType("llm_first_token"));
    callData.avgTTSFirstByte = avg(byType("tts_first_byte"));
    callData.avgTurnTaking = avg(byType("turn_taking"));
    callData.avgTotalResponse = avg(byType("total_response"));
  }
}

// Singleton instance
export const latencyMonitor = new LatencyMonitor();

// Convenience functions
export function startCallMonitoring(callId: string): void {
  latencyMonitor.startCall(callId);
}

export function recordLatency(
  callId: string, 
  metricType: MetricType, 
  valueMs: number,
  details?: Record<string, any>
): void {
  latencyMonitor.record(callId, metricType, valueMs, details);
}

export function endCallMonitoring(callId: string): CallMetrics | null {
  return latencyMonitor.endCall(callId);
}

export function getLatencyStats(): GlobalStats {
  return latencyMonitor.getGlobalStats();
}

// Cleanup old metrics every 10 minutes
setInterval(() => {
  latencyMonitor.cleanup();
}, 10 * 60 * 1000);
