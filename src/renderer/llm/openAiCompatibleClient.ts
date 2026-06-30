import { SettingsState } from "../../sharedState";
import { Message } from "../components/Message";
import { ANIMATION_PROMPT_CONTEXT } from "../clippy-animation-helpers";

const activeRequests = new Map<string, AbortController>();

const ANIMATION_REMINDER_PROMPT = `Animation reminder for this response:
Begin with exactly one supported animation token, such as [Thinking].
The animation token must be the first non-whitespace text in the response.
Do not omit the animation token.
Do not explain the animation token.
Use only a token from the animation list already provided in the system instructions.`;

export type RemotePromptStreamingOptions = {
  requestUUID: string;
};

export function abortRemoteRequest(requestUUID: string) {
  activeRequests.get(requestUUID)?.abort();
  activeRequests.delete(requestUUID);
}

export async function* promptOpenAiCompatibleStreaming(
  userMessage: string,
  messages: Message[],
  settings: SettingsState,
  options: RemotePromptStreamingOptions,
): AsyncIterable<string> {
  const apiBaseUrl = normalizeApiBaseUrl(settings.remoteApiBaseUrl);
  const model = settings.remoteModelName?.trim();

  if (!apiBaseUrl) {
    throw new Error("Remote API Base URL is required.");
  }

  if (!model) {
    throw new Error("Remote model name is required.");
  }

  const controller = new AbortController();
  activeRequests.set(options.requestUUID, controller);

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: getHeaders(settings.remoteApiKey),
      body: JSON.stringify({
        model,
        stream: true,
        temperature: settings.temperature,
        messages: getRemoteMessages(userMessage, messages, settings),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Remote model request failed (${response.status} ${response.statusText})${
          errorText ? `: ${errorText}` : ""
        }`,
      );
    }

    if (!response.body) {
      throw new Error("Remote model response did not include a readable stream.");
    }

    yield* parseOpenAiCompatibleStream(response.body);
  } finally {
    activeRequests.delete(options.requestUUID);
  }
}

function normalizeApiBaseUrl(apiBaseUrl?: string): string {
  return (apiBaseUrl || "").trim().replace(/\/+$/, "");
}

function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const trimmedApiKey = apiKey?.trim();

  if (trimmedApiKey) {
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  }

  return headers;
}

function getRemoteMessages(
  userMessage: string,
  messages: Message[],
  settings: SettingsState,
) {
  const remoteMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  const systemPrompt = getResolvedSystemPrompt(settings.systemPrompt);

  if (systemPrompt) {
    remoteMessages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  for (const message of getRecentMessages(messages)) {
    if (!message.content) {
      continue;
    }

    remoteMessages.push({
      role: message.sender === "user" ? "user" : "assistant",
      content: message.content,
    });
  }

  remoteMessages.push({
    role: "system",
    content: ANIMATION_REMINDER_PROMPT,
  });

  remoteMessages.push({
    role: "user",
    content: userMessage,
  });

  return remoteMessages;
}

function getResolvedSystemPrompt(systemPrompt?: string): string {
  return (systemPrompt || "").replace(
    "[LIST OF ANIMATIONS]",
    ANIMATION_PROMPT_CONTEXT,
  );
}

function getRecentMessages(messages: Message[]): Message[] {
  return messages.slice(-10);
}

async function* parseOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const chunk = parseStreamLine(line);

      if (chunk === "[DONE]") {
        return;
      }

      if (chunk) {
        yield chunk;
      }
    }
  }

  const finalChunk = decoder.decode();

  if (finalChunk) {
    buffer += finalChunk;
  }

  if (buffer) {
    const chunk = parseStreamLine(buffer);

    if (chunk && chunk !== "[DONE]") {
      yield chunk;
    }
  }
}

function parseStreamLine(line: string): string | null {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith(":")) {
    return null;
  }

  const data = trimmedLine.startsWith("data:")
    ? trimmedLine.slice("data:".length).trim()
    : trimmedLine;

  if (!data) {
    return null;
  }

  if (data === "[DONE]") {
    return "[DONE]";
  }

  try {
    const parsed = JSON.parse(data);

    return (
      parsed.choices?.[0]?.delta?.content ||
      parsed.choices?.[0]?.message?.content ||
      parsed.response ||
      null
    );
  } catch (error) {
    console.warn("Failed to parse remote model stream line", error, line);
    return null;
  }
}
