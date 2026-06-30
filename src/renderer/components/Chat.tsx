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

    try {
      const requestUUID = crypto.randomUUID();
      setLastRequestUUID(requestUUID);

      console.groupCollapsed(
        `[Clippy Chat] Request ${requestUUID} animation parsing`,
      );
      console.log(`[Clippy Chat] User message: ${message}`);
      console.log(`[Clippy Chat] LLM backend: ${settings.llmBackend || "local"}`);

      const response = getPromptStreamingResponse(message, messages, settings, {
        requestUUID,
      });

      let fullContent = "";
      let filteredContent = "";
      let hasSetAnimationKey = false;
      let hasLoggedNoAnimationYet = false;
      let chunkIndex = 0;

      for await (const chunk of response) {
        chunkIndex += 1;
        console.log(`[Clippy Chat] Raw chunk ${chunkIndex}: ${chunk}`);

        if (fullContent === "") {
          setStatus("responding");
        }

        if (!hasSetAnimationKey) {
          const contentToParse = fullContent + chunk;
          const { text, animationKey, matchedToken, parserState } =
            filterMessageContent(contentToParse);

          console.log(`[Clippy Chat] Raw accumulated response: ${contentToParse}`);
          console.log(
            `[Clippy Chat] Animation parser result: ${JSON.stringify({
              parserState,
              matchedToken,
              animationKey,
              filteredTextPreview: text.slice(0, 200),
            })}`,
          );

          filteredContent = text;
          fullContent = contentToParse;

          if (animationKey) {
            console.log(
              `[Clippy Chat] Triggering animation: ${animationKey} from token ${matchedToken}`,
            );
            setAnimationKey(animationKey);
            hasSetAnimationKey = true;
          } else if (
            parserState === "no-animation-token" &&
            !hasLoggedNoAnimationYet
          ) {
            console.warn(
              "[Clippy Chat] No valid animation token detected at the start of the response yet.",
            );
            hasLoggedNoAnimationYet = true;
          }
        } else {
          filteredContent += chunk;
          fullContent += chunk;
        }

        setStreamingMessageContent(filteredContent);
      }

      console.log(`[Clippy Chat] Final raw model response: ${fullContent}`);
      console.log(`[Clippy Chat] Final displayed response: ${filteredContent}`);
      console.log(`[Clippy Chat] Animation was triggered: ${hasSetAnimationKey}`);
      console.groupEnd();

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
      console.groupEnd();

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

/**
 * Filter the message content to get the text and animation key
 *
 * @param content - The content of the message
 * @returns The text, animation key, matched token, and parser state
 */
function filterMessageContent(content: string): {
  text: string;
  animationKey: string;
  matchedToken: string;
  parserState:
    | "waiting-for-token"
    | "partial-token"
    | "valid-token"
    | "no-animation-token";
} {
  let text = content;
  let animationKey = "";
  let matchedToken = "";
  let parserState:
    | "waiting-for-token"
    | "partial-token"
    | "valid-token"
    | "no-animation-token" = "no-animation-token";

  if (content === "[") {
    text = "";
    parserState = "waiting-for-token";
  } else if (/^\[[A-Za-z0-9 ]*$/m.test(content)) {
    text = content.replace(/^\[[A-Za-z0-9 ]*$/m, "").trim();
    parserState = "partial-token";
  } else {
    // Check for animation keys in brackets
    for (const key of ANIMATION_KEYS_BRACKETS) {
      if (content.startsWith(key)) {
        animationKey = key.slice(1, -1);
        matchedToken = key;
        text = content.slice(key.length).trim();
        parserState = "valid-token";
        break;
      }
    }
  }

  return { text, animationKey, matchedToken, parserState };
}
