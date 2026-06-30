import { useState } from "react";

import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { electronAi } from "../clippyApi";
import {
  abortRemoteRequest,
  promptOpenAiCompatibleStreaming,
} from "../llm/openAiCompatibleClient";
import { SettingsState } from "../../sharedState";

const RESPONSE_LOG_PREVIEW_LENGTH = 300;

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
            hasFinishedAnimationParsing = true;
          }
        } else {
          filteredContent += chunk;
          fullContent += chunk;
        }

        setStreamingMessageContent(filteredContent);
      }

      logChatResponseSummary(fullContent, filteredContent, animationDebug);

      // Once streaming is complete, add the full message to the messages array
      // and clear the streaming message
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
    return userMessage;
  }

  const resolvedSystemPrompt = systemPrompt.replace(
    "[LIST OF ANIMATIONS]",
    ANIMATION_KEYS_BRACKETS.join(", "),
  );

  return `<system_instructions>\n${resolvedSystemPrompt}\n</system_instructions>\n\n<user_message>\n${userMessage}\n</user_message>`;
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
  triggered: boolean;
};

/**
 * Filter the message content to get the text and animation key
 *
 * @param content - The content of the message
 * @returns The text, animation key, matched token, unsupported token, and parser state
 */
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

  if (trimmedContent === "[") {
    text = "";
    parserState = "waiting-for-token";
  } else if (/^\[[A-Za-z0-9 _-]*$/m.test(trimmedContent)) {
    text = "";
    parserState = "partial-token";
  } else {
    // Check for animation keys in brackets. Leading whitespace is ignored so
    // streamed responses like " [Alert] ..." still trigger properly.
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
