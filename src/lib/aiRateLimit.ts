export type AiRateLimitStatus = "queued" | "waiting" | "running" | "rate_limited" | "done" | "error";

export type AiTaskStatus = {
  status: AiRateLimitStatus;
  message: string;
  waitMs?: number;
  attempt: number;
};

export type AiServiceErrorPayload = {
  error?: unknown;
  message?: unknown;
  msg?: unknown;
  summary?: unknown;
  code?: unknown;
  retryAfterMs?: unknown;
  retryable?: unknown;
};

export class AiRateLimitError extends Error {
  code = "AI_RATE_LIMITED";
  retryAfterMs: number;
  retryable = true;

  constructor(message = "Se alcanzó el límite temporal de IA. Intente continuar en unos minutos.", retryAfterMs = 15_000) {
    super(message);
    this.name = "AiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

type AiRateLimitCounters = {
  dayKey: string;
  dailyCount: number;
  minuteBucket: number;
  minuteCount: number;
  lastStartedAt: number;
  rateLimitedUntil: number;
};

type RunAiTaskOptions = {
  label?: string;
  onStatus?: (status: AiTaskStatus) => void;
  maxRetries?: number;
  retryDelaysMs?: number[];
  minRequestIntervalMs?: number;
  minuteRequestLimit?: number;
  dailyRequestLimit?: number;
};

const COUNTER_STORAGE_KEY = "egm-control:ai-rate-limit:v1";
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 5_000;
const DEFAULT_MINUTE_REQUEST_LIMIT = 15;
const DEFAULT_DAILY_REQUEST_LIMIT = 500;
const DEFAULT_RETRY_DELAYS_MS = [15_000, 30_000];

let aiQueue = Promise.resolve();

const getEnvNumber = (key: string, fallback: number) => {
  const value = import.meta.env[key];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const currentMinuteBucket = () => Math.floor(Date.now() / 60_000);

const emptyCounters = (): AiRateLimitCounters => ({
  dayKey: todayKey(),
  dailyCount: 0,
  minuteBucket: currentMinuteBucket(),
  minuteCount: 0,
  lastStartedAt: 0,
  rateLimitedUntil: 0,
});

const storageAvailable = () => typeof window !== "undefined" && !!window.localStorage;

const readCounters = (): AiRateLimitCounters => {
  if (!storageAvailable()) return emptyCounters();

  try {
    const raw = window.localStorage.getItem(COUNTER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<AiRateLimitCounters> : {};
    const counters = { ...emptyCounters(), ...parsed };
    const day = todayKey();
    const minute = currentMinuteBucket();

    if (counters.dayKey !== day) {
      counters.dayKey = day;
      counters.dailyCount = 0;
    }

    if (counters.minuteBucket !== minute) {
      counters.minuteBucket = minute;
      counters.minuteCount = 0;
    }

    return counters;
  } catch {
    return emptyCounters();
  }
};

const writeCounters = (counters: AiRateLimitCounters) => {
  if (!storageAvailable()) return;
  window.localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(counters));
};

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

const statusMessage = (status: AiRateLimitStatus, waitMs = 0) => {
  if (status === "queued") return "Solicitud de IA en cola.";
  if (status === "running") return "Procesando con IA.";
  if (status === "rate_limited") return "La IA indicó límite temporal; se reintentará con pausa.";
  if (status === "waiting") {
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));
    return `Esperando cupo de IA (${seconds}s).`;
  }
  if (status === "done") return "Solicitud de IA completada.";
  return "No se pudo completar la solicitud de IA.";
};

const emitStatus = (
  onStatus: RunAiTaskOptions["onStatus"],
  status: AiRateLimitStatus,
  attempt: number,
  waitMs = 0,
) => {
  onStatus?.({
    status,
    attempt,
    waitMs,
    message: statusMessage(status, waitMs),
  });
};

const nextLocalWaitMs = (
  counters: AiRateLimitCounters,
  minRequestIntervalMs: number,
  minuteRequestLimit: number,
) => {
  const now = Date.now();
  const cooldownWait = Math.max(0, counters.lastStartedAt + minRequestIntervalMs - now);
  const rateLimitWait = Math.max(0, counters.rateLimitedUntil - now);
  const minuteWait = counters.minuteCount >= minuteRequestLimit
    ? Math.max(0, ((counters.minuteBucket + 1) * 60_000) - now)
    : 0;

  return Math.max(cooldownWait, rateLimitWait, minuteWait);
};

const markRequestStarted = () => {
  const counters = readCounters();
  counters.lastStartedAt = Date.now();
  counters.dailyCount += 1;
  counters.minuteCount += 1;
  writeCounters(counters);
};

const setRateLimitedUntil = (retryAfterMs: number) => {
  const counters = readCounters();
  counters.rateLimitedUntil = Math.max(counters.rateLimitedUntil, Date.now() + retryAfterMs);
  writeCounters(counters);
};

export const createAiServiceError = (payload: AiServiceErrorPayload, fallbackStatus?: number) => {
  const messageCandidates = [payload.error, payload.message, payload.msg, payload.summary];
  const message = messageCandidates.find((value): value is string => typeof value === "string" && value.trim())
    || "No se pudo completar la solicitud de IA.";
  const code = typeof payload.code === "string" ? payload.code : "";
  const retryAfterMs = typeof payload.retryAfterMs === "number" && Number.isFinite(payload.retryAfterMs)
    ? payload.retryAfterMs
    : DEFAULT_RETRY_DELAYS_MS[0];

  if (code === "AI_RATE_LIMITED" || fallbackStatus === 429) {
    return new AiRateLimitError(message, retryAfterMs);
  }

  return new Error(message);
};

export const isAiRateLimitError = (error: unknown): error is AiRateLimitError =>
  error instanceof AiRateLimitError ||
  (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "AI_RATE_LIMITED");

export const createAiServiceErrorFromSupabaseFunctionError = async (error: unknown, fallback = "No se pudo invocar la función de IA") => {
  const fallbackMessage = error instanceof Error ? error.message : fallback;
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context && typeof context === "object") {
    const response = context as Response;
    const readableResponse = typeof response.clone === "function" ? response.clone() : response;

    if (typeof readableResponse.json === "function") {
      try {
        const payload = await readableResponse.json();
        if (payload && typeof payload === "object") {
          return createAiServiceError(payload as AiServiceErrorPayload, response.status);
        }
      } catch {
        // Fall through to text parsing.
      }
    }

    const textResponse = typeof response.clone === "function" ? response.clone() : response;
    if (typeof textResponse.text === "function") {
      try {
        const text = await textResponse.text();
        return new Error(text || fallbackMessage);
      } catch {
        return new Error(fallbackMessage);
      }
    }
  }

  return new Error(fallbackMessage);
};

const executeWithRateLimit = async <T>(task: () => Promise<T>, options: RunAiTaskOptions): Promise<T> => {
  const {
    onStatus,
    maxRetries = 2,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    minRequestIntervalMs = getEnvNumber("VITE_AI_MIN_REQUEST_INTERVAL_MS", DEFAULT_MIN_REQUEST_INTERVAL_MS),
    minuteRequestLimit = getEnvNumber("VITE_AI_MINUTE_REQUEST_LIMIT", DEFAULT_MINUTE_REQUEST_LIMIT),
    dailyRequestLimit = getEnvNumber("VITE_AI_DAILY_REQUEST_LIMIT", DEFAULT_DAILY_REQUEST_LIMIT),
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const counters = readCounters();
    if (counters.dailyCount >= dailyRequestLimit) {
      const error = new AiRateLimitError("Se alcanzó el límite diario local de IA. Intente nuevamente mañana.", 0);
      emitStatus(onStatus, "error", attempt);
      throw error;
    }

    const waitMs = nextLocalWaitMs(counters, minRequestIntervalMs, minuteRequestLimit);
    if (waitMs > 0) {
      emitStatus(onStatus, "waiting", attempt, waitMs);
      await delay(waitMs);
    }

    emitStatus(onStatus, "running", attempt);
    markRequestStarted();

    try {
      const result = await task();
      emitStatus(onStatus, "done", attempt);
      return result;
    } catch (error) {
      if (!isAiRateLimitError(error) || attempt >= maxRetries) {
        emitStatus(onStatus, "error", attempt);
        throw error;
      }

      const retryAfterMs = error.retryAfterMs > 0 ? error.retryAfterMs : retryDelaysMs[attempt] || retryDelaysMs[retryDelaysMs.length - 1] || DEFAULT_RETRY_DELAYS_MS[0];
      setRateLimitedUntil(retryAfterMs);
      emitStatus(onStatus, "rate_limited", attempt, retryAfterMs);
      await delay(retryAfterMs);
    }
  }

  emitStatus(onStatus, "error", maxRetries);
  throw new AiRateLimitError();
};

export const runAiTask = <T>(task: () => Promise<T>, options: RunAiTaskOptions = {}) => {
  emitStatus(options.onStatus, "queued", 0);

  const run = aiQueue.then(() => executeWithRateLimit(task, options));
  aiQueue = run.catch(() => undefined).then(() => undefined);
  return run;
};

export const resetAiRateLimitState = (clearStorage = true) => {
  aiQueue = Promise.resolve();
  if (clearStorage && storageAvailable()) {
    window.localStorage.removeItem(COUNTER_STORAGE_KEY);
  }
};
