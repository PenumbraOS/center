import { describe, expect, it } from "vitest";
import type { SettingsSchema } from "../api";
import {
  collectChanges,
  fieldVisible,
  initialValues,
  nestChanges,
} from "./schemaSettings";

const schema: SettingsSchema = {
  sections: [
    {
      key: "llm",
      label: "LLM",
      fields: [
        {
          key: "llm.provider",
          label: "Provider",
          type: "enum",
          value: "anthropic",
          options: [
            { value: "anthropic", label: "Anthropic" },
            { value: "openai-compatible", label: "OpenAI-compatible" },
          ],
        },
        { key: "llm.api_key", label: "API Key", type: "secret", configured: true },
        {
          key: "llm.base_url",
          label: "Base URL",
          type: "string",
          value: "",
          visibleWhen: { "llm.provider": "openai-compatible" },
        },
        { key: "llm.web_search", label: "Web search", type: "bool", value: false },
      ],
    },
  ],
};

describe("initialValues", () => {
  it("seeds from the descriptor, with secrets empty", () => {
    expect(initialValues(schema)).toEqual({
      "llm.provider": "anthropic",
      "llm.api_key": "",
      "llm.base_url": "",
      "llm.web_search": false,
    });
  });
});

describe("fieldVisible", () => {
  const baseUrl = schema.sections[0].fields[2];

  it("hides a conditional field until its dependency matches", () => {
    expect(fieldVisible(baseUrl, { "llm.provider": "anthropic" })).toBe(false);
    expect(fieldVisible(baseUrl, { "llm.provider": "openai-compatible" })).toBe(
      true,
    );
  });
});

describe("collectChanges", () => {
  it("returns nothing when untouched", () => {
    expect(collectChanges(schema, initialValues(schema))).toEqual({});
  });

  it("includes edited scalars and typed secrets, but not empty secrets", () => {
    const values = initialValues(schema);
    values["llm.web_search"] = true;
    values["llm.api_key"] = "sk-new";
    expect(collectChanges(schema, values)).toEqual({
      "llm.web_search": true,
      "llm.api_key": "sk-new",
    });
  });

  it("skips a field that its visibleWhen has hidden", () => {
    const values = initialValues(schema);
    // Edit base_url, then switch the provider so base_url is no longer shown.
    values["llm.base_url"] = "https://api.example.com/v1";
    values["llm.provider"] = "anthropic";
    expect(collectChanges(schema, values)).toEqual({});
  });
});

describe("nestChanges", () => {
  it("nests dotted keys into the typed request tree", () => {
    expect(
      nestChanges({
        "llm.model": "claude-x",
        "llm.web_search": true,
        "dev.apk_install_enabled": true,
      }),
    ).toEqual({
      llm: { model: "claude-x", web_search: true },
      dev: { apk_install_enabled: true },
    });
  });
});
