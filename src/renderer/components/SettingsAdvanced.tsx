import { useEffect, useState } from "react";
import { clippyApi } from "../clippyApi";
import { useSharedState } from "../contexts/SharedStateContext";
import { Checkbox } from "./Checkbox";

export const SettingsAdvanced: React.FC = () => {
  const { settings } = useSharedState();
  const [chatWindowWidth, setChatWindowWidth] = useState(
    String(settings.chatWindowWidth || 500),
  );
  const [chatWindowHeight, setChatWindowHeight] = useState(
    String(settings.chatWindowHeight || 360),
  );

  useEffect(() => {
    setChatWindowWidth(String(settings.chatWindowWidth || 500));
    setChatWindowHeight(String(settings.chatWindowHeight || 360));
  }, [settings.chatWindowWidth, settings.chatWindowHeight]);

  const handleSaveChatWindowSize = async () => {
    const width = parseIntegerWithFallback(chatWindowWidth, 500);
    const height = parseIntegerWithFallback(chatWindowHeight, 360);

    await clippyApi.setState("settings.chatWindowWidth", width);
    await clippyApi.setState("settings.chatWindowHeight", height);

    setChatWindowWidth(String(width));
    setChatWindowHeight(String(height));
  };

  return (
    <div>
      <fieldset>
        <legend>Windows</legend>
        <Checkbox
          id="centerChatWindow"
          label="Center chat window on screen"
          checked={!!settings.centerChatWindow}
          onChange={(checked) => {
            clippyApi.setState("settings.centerChatWindow", checked);
          }}
        />
        <p style={{ marginTop: "10px" }}>
          Open the chat window in the center of the display instead of next to
          Clippy.
        </p>
        <div className="field-row-stacked" style={{ marginTop: "10px" }}>
          <label htmlFor="chatWindowWidth">Chat window width</label>
          <input
            id="chatWindowWidth"
            type="number"
            min={300}
            max={1200}
            step={10}
            value={chatWindowWidth}
            onBlur={handleSaveChatWindowSize}
            onChange={(event) => setChatWindowWidth(event.target.value)}
          />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="chatWindowHeight">Chat window height</label>
          <input
            id="chatWindowHeight"
            type="number"
            min={250}
            max={1000}
            step={10}
            value={chatWindowHeight}
            onBlur={handleSaveChatWindowSize}
            onChange={(event) => setChatWindowHeight(event.target.value)}
          />
        </div>
        <button style={{ marginTop: "10px" }} onClick={handleSaveChatWindowSize}>
          Save Chat Window Size
        </button>
        <p style={{ marginTop: "10px" }}>
          The new size applies the next time the chat window is created. Close
          and restart Clippy after changing this if the chat window is already
          open.
        </p>
      </fieldset>
      <fieldset>
        <legend>Automatic Updates</legend>
        <Checkbox
          id="autoUpdates"
          label="Automatically keep Clippy up to date"
          checked={!settings.disableAutoUpdate}
          onChange={(checked) => {
            clippyApi.setState("settings.disableAutoUpdate", !checked);
          }}
        />

        <button
          style={{ marginTop: "10px" }}
          onClick={() => clippyApi.checkForUpdates()}
        >
          Check for Updates
        </button>
      </fieldset>
      <fieldset>
        <legend>Configuration</legend>
        <p>
          Clippy keeps its configuration in JSON files. Click these buttons to
          open them in your default JSON editor. After editing, restart Clippy
          to apply the changes.
        </p>
        <button onClick={clippyApi.openStateInEditor}>
          Open Configuration File
        </button>
        <button onClick={clippyApi.openDebugStateInEditor}>
          Open Debug File
        </button>
      </fieldset>
      <fieldset>
        <legend>Delete All Models</legend>
        <p>
          This will delete all models from Clippy. This action is not
          reversible.
        </p>
        <button onClick={clippyApi.deleteAllModels}>Delete All Models</button>
      </fieldset>
    </div>
  );
};

function parseIntegerWithFallback(value: string, fallback: number): number {
  const parsedValue = parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    return fallback;
  }

  return parsedValue;
}
