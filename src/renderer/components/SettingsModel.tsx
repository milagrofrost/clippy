import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useEffect, useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";
import { SettingsState } from "../../sharedState";

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const isRemoteBackend = settings.llmBackend === "openai-compatible";

  const columns: Array<Column> = [
    { key: "default", header: "Loaded", width: 50 },
    { key: "name", header: "Name" },
    {
      key: "size",
      header: "Size",
      render: (row) => `${row.size.toLocaleString()} MB`,
    },
    { key: "company", header: "Company" },
    { key: "downloaded", header: "Downloaded" },
  ];

  const modelKeys = Object.keys(models || {});
  const data = modelKeys.map((modelKey) => {
    const model = models?.[modelKey as keyof typeof models];

    return {
      default:
        !isRemoteBackend && model?.name === settings.selectedModel ? "ｘ" : "",
      name: model?.name,
      company: model?.company,
      size: model?.size,
      downloaded: model.downloaded ? "Yes" : "No",
    };
  });

  // Variables
  const selectedModel =
    models?.[modelKeys[selectedIndex] as keyof typeof models] || null;
  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel =
    !isRemoteBackend && selectedModel?.name === settings.selectedModel;

  // Handlers
  // ---------------------------------------------------------------------------
  const handleRowSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleDownload = async () => {
    if (selectedModel) {
      await clippyApi.downloadModelByName(data[selectedIndex].name);
    }
  };

  const handleDeleteOrRemove = async () => {
    if (selectedModel?.imported) {
      await clippyApi.removeModelByName(selectedModel.name);
    } else if (selectedModel) {
      await clippyApi.deleteModelByName(selectedModel.name);
    }
  };

  const handleMakeDefault = async () => {
    if (selectedModel) {
      await clippyApi.setState("settings.llmBackend", "local");
      await clippyApi.setState("settings.selectedModel", selectedModel.name);
    }
  };

  return (
    <div>
      <fieldset style={{ marginBottom: "20px" }}>
        <legend>Backend</legend>
        <div className="field-row">
          <input
            id="llmBackendLocal"
            type="radio"
            name="llmBackend"
            checked={!isRemoteBackend}
            onChange={() => clippyApi.setState("settings.llmBackend", "local")}
          />
          <label htmlFor="llmBackendLocal">Local GGUF model</label>
        </div>
        <div className="field-row">
          <input
            id="llmBackendRemote"
            type="radio"
            name="llmBackend"
            checked={isRemoteBackend}
            onChange={() =>
              clippyApi.setState("settings.llmBackend", "openai-compatible")
            }
          />
          <label htmlFor="llmBackendRemote">OpenAI-compatible remote API</label>
        </div>
      </fieldset>

      {isRemoteBackend && <RemoteModelSettings />}

      <p>
        Select the model you want to use for your chat. The larger the model,
        the more powerful the chat, but the slower it will be - and the more
        memory it will use. Clippy uses models in the GGUF format. {" "}
        <a
          href="https://github.com/felixrieseberg/clippy?tab=readme-ov-file#downloading-more-models"
          target="_blank"
        >
          More information.
        </a>
      </p>

      <button
        style={{ marginBottom: 10 }}
        onClick={() => clippyApi.addModelFromFile()}
      >
        Add model from file
      </button>
      <TableView
        columns={columns}
        data={data}
        onRowSelect={handleRowSelect}
        initialSelectedIndex={selectedIndex}
      />

      {selectedModel && (
        <div
          className="model-details sunken-panel"
          style={{ marginTop: "20px", padding: "15px" }}
        >
          <strong>{selectedModel.name}</strong>

          {selectedModel.description && <p>{selectedModel.description}</p>}

          {selectedModel.homepage && (
            <p>
              <a
                href={selectedModel.homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Homepage
              </a>
            </p>
          )}

          <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
            {!selectedModel.downloaded ? (
              <button disabled={isDownloading} onClick={handleDownload}>
                Download Model
              </button>
            ) : (
              <>
                <button
                  disabled={isDownloading || isDefaultModel}
                  onClick={handleMakeDefault}
                >
                  {isDefaultModel
                    ? "Clippy uses this model"
                    : "Make Clippy use this model"}
                </button>
                <button onClick={handleDeleteOrRemove}>
                  {selectedModel?.imported ? "Remove" : "Delete"} Model
                </button>
              </>
            )}
          </div>
          <SettingsModelDownload model={selectedModel} />
        </div>
      )}
    </div>
  );
};

const RemoteModelSettings: React.FC = () => {
  const { settings } = useSharedState();
  const [remoteApiBaseUrl, setRemoteApiBaseUrl] = useState(
    settings.remoteApiBaseUrl || "",
  );
  const [remoteModelName, setRemoteModelName] = useState(
    settings.remoteModelName || "",
  );
  const [remoteApiKey, setRemoteApiKey] = useState(settings.remoteApiKey || "");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    setRemoteApiBaseUrl(settings.remoteApiBaseUrl || "");
    setRemoteModelName(settings.remoteModelName || "");
    setRemoteApiKey(settings.remoteApiKey || "");
  }, [settings.remoteApiBaseUrl, settings.remoteModelName, settings.remoteApiKey]);

  const getDraftSettings = (): SettingsState => ({
    ...settings,
    remoteApiBaseUrl,
    remoteModelName,
    remoteApiKey,
  });

  const handleSave = async () => {
    await clippyApi.setState("settings.remoteApiBaseUrl", remoteApiBaseUrl);
    await clippyApi.setState("settings.remoteModelName", remoteModelName);
    await clippyApi.setState("settings.remoteApiKey", remoteApiKey);
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMessage("Testing remote API...");

    try {
      await handleSave();
      const responseText = await testOpenAiCompatibleConnection(getDraftSettings());

      setTestStatus("success");
      setTestMessage(
        `Connection successful${responseText ? `: ${responseText}` : "."}`,
      );
    } catch (error) {
      setTestStatus("error");
      setTestMessage(getErrorMessage(error));
    }
  };

  return (
    <fieldset style={{ marginBottom: "20px" }}>
      <legend>OpenAI-compatible Remote API</legend>
      <p>
        Use an OpenAI-compatible endpoint such as Ollama, llama.cpp server,
        OpenRouter, LiteLLM, or OpenAI. Clippy will call /v1/chat/completions.
      </p>
      <div className="field-row-stacked">
        <label htmlFor="remoteApiBaseUrl">API Base URL</label>
        <input
          id="remoteApiBaseUrl"
          type="text"
          placeholder="http://10.10.101.10:11434/v1"
          value={remoteApiBaseUrl}
          onBlur={handleSave}
          onChange={(e) => {
            setRemoteApiBaseUrl(e.target.value);
            setTestStatus("idle");
            setTestMessage("");
          }}
        />
      </div>
      <div className="field-row-stacked">
        <label htmlFor="remoteModelName">Model Name</label>
        <input
          id="remoteModelName"
          type="text"
          placeholder="llama3.2, qwen2.5:0.5b, gpt-4o-mini"
          value={remoteModelName}
          onBlur={handleSave}
          onChange={(e) => {
            setRemoteModelName(e.target.value);
            setTestStatus("idle");
            setTestMessage("");
          }}
        />
      </div>
      <div className="field-row-stacked">
        <label htmlFor="remoteApiKey">API Key</label>
        <input
          id="remoteApiKey"
          type="password"
          placeholder="Optional for local Ollama/llama.cpp servers"
          value={remoteApiKey}
          onBlur={handleSave}
          onChange={(e) => {
            setRemoteApiKey(e.target.value);
            setTestStatus("idle");
            setTestMessage("");
          }}
        />
      </div>
      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
        <button onClick={handleSave}>Save Remote Settings</button>
        <button
          disabled={testStatus === "testing"}
          onClick={handleTestConnection}
        >
          {testStatus === "testing" ? "Testing..." : "Test Connection"}
        </button>
      </div>
      {testMessage && (
        <p
          style={{
            marginTop: "10px",
            fontWeight: "bold",
            color: testStatus === "error" ? "#a80000" : undefined,
          }}
        >
          {testMessage}
        </p>
      )}
    </fieldset>
  );
};

async function testOpenAiCompatibleConnection(
  settings: SettingsState,
): Promise<string> {
  const apiBaseUrl = normalizeApiBaseUrl(settings.remoteApiBaseUrl);
  const model = settings.remoteModelName?.trim();

  if (!apiBaseUrl) {
    throw new Error("API Base URL is required.");
  }

  if (!model) {
    throw new Error("Model Name is required.");
  }

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: getRemoteHeaders(settings.remoteApiKey),
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 8,
      messages: [
        {
          role: "user",
          content: "Reply with OK only.",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Remote API test failed (${response.status} ${response.statusText})${
        errorText ? `: ${errorText}` : ""
      }`,
    );
  }

  const data = await response.json();
  const responseText = data.choices?.[0]?.message?.content?.trim();

  return responseText || "OK";
}

function normalizeApiBaseUrl(apiBaseUrl?: string): string {
  return (apiBaseUrl || "").trim().replace(/\/+$/, "");
}

function getRemoteHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const trimmedApiKey = apiKey?.trim();

  if (trimmedApiKey) {
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  }

  return headers;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const SettingsModelDownload: React.FC<{
  model?: ManagedModel;
}> = ({ model }) => {
  if (!model || !isModelDownloading(model)) {
    return null;
  }

  const downloadSpeed = prettyDownloadSpeed(
    model?.downloadState?.currentBytesPerSecond || 0,
  );

  return (
    <div style={{ marginTop: "15px" }}>
      <p>
        Downloading {model.name}... ({downloadSpeed}/s)
      </p>
      <Progress progress={model.downloadState?.percentComplete || 0} />
    </div>
  );
};
