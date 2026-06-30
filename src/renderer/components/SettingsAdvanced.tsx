import { clippyApi } from "../clippyApi";
import { useSharedState } from "../contexts/SharedStateContext";
import { Checkbox } from "./Checkbox";

export const SettingsAdvanced: React.FC = () => {
  const { settings } = useSharedState();

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
            value={settings.chatWindowWidth || 500}
            onChange={(event) => {
              clippyApi.setState(
                "settings.chatWindowWidth",
                parseInt(event.target.value, 10),
              );
            }}
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
            value={settings.chatWindowHeight || 360}
            onChange={(event) => {
              clippyApi.setState(
                "settings.chatWindowHeight",
                parseInt(event.target.value, 10),
              );
            }}
          />
        </div>
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