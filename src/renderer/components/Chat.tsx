import { useState } from "react";

import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import {
  ANIMATION_KEYS_BRACKETS,
  ANIMATION_PROMPT_CONTEXT,
} from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { electronAi } from "../clippyApi";
import {
  abortRemoteRequest,
  promptOpenAiCompatibleStreaming,
} from "../llm/openAiCompatibleClient";
import { SettingsState } from "../../sharedState";

const RESPONSE_LOG_PREVIEW_LENGTH = 300;
const DEFAULT_FALLBACK_ANIMATION = "Thinking";

export type ChatProps = {
  style?: React.CSSProperties;
};

export function Chat({ style }: ChatProps) {
  const { setAnimationKey, setStatus, status, messages, addMessage } =
    useChat();
  const { settings } = useSharedState();
  const [streamingMessageContent, setStreamingMessageContent] =
    useState<string>("");
  const [lastRequestUUID, setLastRequestUUID] = useState<string>(
    crypto.randomUUID(),
  );

  const handleAbortMessage = () => {
    if (settings.llmBackend === "openai-compatible") {
      abortRemoteRequest(lastRequestUUID);
      return;
    }

    electronAi.abortRequest(lastRequestUUID);
  };

  const handleSendMessage = async (message: string) => {
    if (status !== "idle") {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: message,
      sender: "user",
      createdAt: Date.now(),
    };

    await addMessage(userMessage);
    setStreamingMessageContent("");
    setStatus("thinking");

    let fullContent = "";
    let filteredContent = "";
    let animationDebug: AnimationDebugResult = {
      parserState: "not-parsed",
      animationKey: "",
      matchedToken: "",
      unsupportedToken: "",
      fallbackKey: "",
      triggered: false,
    };

    try {
      const requestUUID = crypto.randomUUID();
      setLastRequestUUID(requestUUID);

      console.log(
        `[Clippy Chat] Request ${requestUUID}: user=${JSON.stringify(message)} backend=${settings.llmBackend || "local"}`,
      );

      const response = getPromptStreamingResponse(message, messages, settings, {
        requestUUID,
      });

      let hasFinishedAnimationParsing = false;

      for await (const chunk of response) {
        if (fullContent === "") {
          setStatus("responding");
        }

        if (!hasFinishedAnimationParsing) {
          const contentToParse = fullContent + chunk;
          const filterResult = filterMessageContent(contentToParse);

          filteredContent = filterResult.text;
          fullContent = contentToParse;
          animationDebug = {
            parserState: filterResult.parserState,
            animationKey: filterResult.animationKey,
            matchedToken: filterResult.matchedToken,
            unsupportedToken: filterResult.unsupportedToken,
            fallbackKey: "",
            triggered: false,
          };

          if (filterResult.animationKey) {
            setAnimationKey(filterResult.animationKey);
            animationDebug.triggered = true;
            hasFinishedAnimationParsing = true;
          } else if (
            filterResult.unsupportedToken ||
            filterResult.parserState === "no-animation-token"
          ) {
            const fallbackKey = getFallbackAnimationKey(
              filterResult.text,
              message,
            );

            setAnimationKey(fallbackKey);
            animationDebug.fallbackKey = fallbackKey;
            hasFinishedAnimationParsing = true;
          }
        } else {
          filteredContent += chunk;
          fullContent += chunk;
        }

        setStreamingMessageContent(filteredContent);
      }

      if (!animationDebug.triggered && !animationDebug.fallbackKey) {
        const fallbackKey = getFallbackAnimationKey(filteredContent, message);
        setAnimationKey(fallbackKey);
        animationDebug.fallbackKey = fallbackKey;
      }

      logChatResponseSummary(fullContent, filteredContent, animationDebug);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: filteredContent,
        sender: "clippy",
        createdAt: Date.now(),
      };

      addMessage(assistantMessage);
    } catch (error) {
      console.error(error);

      addMessage({
        id: crypto.randomUUID(),
        content: `Remote model error: ${getErrorMessage(error)}`,
        sender: "clippy",
        createdAt: Date.now(),
      });
    } finally {
      setStreamingMessageContent("");
      setStatus("idle");
    }
  };

  return (
    <div style={style} className="chat-container">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {status === "responding" && (
        <Message
          message={{
            id: "streaming",
            content: streamingMessageContent,
            sender: "clippy",
            createdAt: Date.now(),
          }}
        />
      )}
      <ChatInput onSend={handleSendMessage} onAbort={handleAbortMessage} />
    </div>
  );
}

function getPromptStreamingResponse(
  userMessage: string,
  messages: Message[],
  settings: SettingsState,
  options: { requestUUID: string },
): AsyncIterable<string> {
  if (settings.llmBackend === "openai-compatible") {
    return promptOpenAiCompatibleStreaming(
      userMessage,
      messages,
      settings,
      options,
    );
  }

  return window.electronAi.promptStreaming(
    getPromptWithSystemInstructions(userMessage, settings.systemPrompt),
    options,
  );
}

function getPromptWithSystemInstructions(
  userMessage: string,
  systemPrompt?: string,
): string {
  if (!systemPrompt) {
    return `${getLocalAnimationReminder()}\n\n${userMessage}`;
  }

  const resolvedSystemPrompt = systemPrompt.replace(
    "[LIST OF ANIMATIONS]",
    ANIMATION_PROMPT_CONTEXT,
  );

  return `<system_instructions>\n${resolvedSystemPrompt}\n\n${getLocalAnimationReminder()}\n</system_instructions>\n\n<user_message>\n${userMessage}\n</user_message>`;
}

function getLocalAnimationReminder(): string {
  return `Animation reminder for this response:
Begin with exactly one supported animation token, such as [Thinking].
The animation token must be the first non-whitespace text in the response.
Do not omit the animation token.
Do not explain the animation token.`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type AnimationParserState =
  | "not-parsed"
  | "waiting-for-token"
  | "partial-token"
  | "valid-token"
  | "unsupported-token"
  | "no-animation-token";

type AnimationDebugResult = {
  parserState: AnimationParserState;
  animationKey: string;
  matchedToken: string;
  unsupportedToken: string;
  fallbackKey: string;
  triggered: boolean;
};

function filterMessageContent(content: string): {
  text: string;
  animationKey: string;
  matchedToken: string;
  unsupportedToken: string;
  parserState: AnimationParserState;
} {
  const trimmedContent = content.trimStart();
  let text = content;
  let animationKey = "";
  let matchedToken = "";
  let unsupportedToken = "";
  let parserState: AnimationParserState = "no-animation-token";

  if (trimmedContent === "") {
    text = "";
    parserState = "waiting-for-token";
  } else if (trimmedContent === "[") {
    text = "";
    parserState = "waiting-for-token";
  } else if (/^\[[A-Za-z0-9 _-]*$/m.test(trimmedContent)) {
    text = "";
    parserState = "partial-token";
  } else {
    for (const key of ANIMATION_KEYS_BRACKETS) {
      if (trimmedContent.startsWith(key)) {
        animationKey = key.slice(1, -1);
        matchedToken = key;
        text = trimmedContent.slice(key.length).trimStart();
        parserState = "valid-token";
        break;
      }
    }

    if (!animationKey) {
      const leadingBracketToken = trimmedContent.match(/^\[([^\]\r\n]{1,80})\]/)?.[0];

      if (leadingBracketToken) {
        unsupportedToken = leadingBracketToken;
        text = trimmedContent.slice(leadingBracketToken.length).trimStart();
        parserState = "unsupported-token";
      }
    }
  }

  return { text, animationKey, matchedToken, unsupportedToken, parserState };
}

function getFallbackAnimationKey(responseText: string, userMessage: string): string {
  const combinedText = `${userMessage}\n${responseText}`.toLowerCase();

  if (/\b(error|fail|failed|broken|warning|careful|problem|issue)\b/.test(combinedText)) {
    return "GetAttention";
  }

  if (/\b(search|find|look up|lookup|investigate|research)\b/.test(combinedText)) {
    return "Searching";
  }

  if (/\b(write|draft|message|email|post|compose|wording)\b/.test(combinedText)) {
    return "Writing";
  }

  if (/\b(save|saved|saving|config|setting|backup|preserve)\b/.test(combinedText)) {
    return "Save";
  }

  if (/\b(done|worked|success|fixed|nice|great|congrats)\b/.test(combinedText)) {
    return "Congratulate";
  }

  if (/\b(explain|because|why|how|means|meaning)\b/.test(combinedText)) {
    return "Explain";
  }

  return DEFAULT_FALLBACK_ANIMATION;
}

function logChatResponseSummary(
  rawResponse: string,
  displayedResponse: string,
  animationDebug: AnimationDebugResult,
) {
  const rawPreview = getLogPreview(rawResponse);
  const displayedPreview = getLogPreview(displayedResponse);

  if (animationDebug.triggered) {
    console.log(
      `[Clippy Chat] Animation: triggered ${animationDebug.animationKey} from ${animationDebug.matchedToken}`,
    );
  } else if (animationDebug.fallbackKey) {
    console.warn(
      `[Clippy Chat] Animation: fallback ${animationDebug.fallbackKey} (${animationDebug.parserState})`,
    );
  } else if (animationDebug.unsupportedToken) {
    console.warn(
      `[Clippy Chat] Animation: unsupported token stripped ${animationDebug.unsupportedToken}`,
    );
  } else {
    console.log(
      `[Clippy Chat] Animation: none detected (${animationDebug.parserState})`,
    );
  }

  console.log(`[Clippy Chat] Raw response preview: ${JSON.stringify(rawPreview)}`);
  console.log(
    `[Clippy Chat] Displayed response preview: ${JSON.stringify(displayedPreview)}`,
  );
}

function getLogPreview(content: string): string {
  if (content.length <= RESPONSE_LOG_PREVIEW_LENGTH) {
    return content;
  }

  return `${content.slice(0, RESPONSE_LOG_PREVIEW_LENGTH)}...`;
}
