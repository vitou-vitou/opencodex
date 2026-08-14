import { describe, expect, test } from "bun:test";
import { PROVIDER_REGISTRY } from "../src/providers/registry";
import {
  AMAZON_BEDROCK_MANTLE_DEFAULT_BASE_URL,
  AMAZON_BEDROCK_MANTLE_BASE_URL_CHOICES,
} from "../src/providers/base-url-choices";

describe("qoder-cn + amazon-bedrock presets (#JetBrains agents follow-up)", () => {
  test("qoder-cn targets China Coding Plan OpenAI host", () => {
    const entry = PROVIDER_REGISTRY.find(e => e.id === "qoder-cn");
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe("Qoder CN");
    expect(entry!.adapter).toBe("openai-chat");
    expect(entry!.authKind).toBe("key");
    expect(entry!.baseUrl).toBe("https://coding.dashscope.aliyuncs.com/v1");
    expect(entry!.note?.toLowerCase()).toContain("china");
  });

  test("alibaba stays International Coding Plan (distinct from qoder-cn)", () => {
    const entry = PROVIDER_REGISTRY.find(e => e.id === "alibaba");
    expect(entry).toBeTruthy();
    expect(entry!.baseUrl).toBe("https://coding-intl.dashscope.aliyuncs.com/v1");
    expect(entry!.label.toLowerCase()).toContain("international");
  });

  test("amazon-bedrock is Mantle OpenAI-compatible, not Amazon Q Agent", () => {
    const entry = PROVIDER_REGISTRY.find(e => e.id === "amazon-bedrock");
    expect(entry).toBeTruthy();
    expect(entry!.adapter).toBe("openai-chat");
    expect(entry!.authKind).toBe("key");
    expect(entry!.baseUrl).toBe(AMAZON_BEDROCK_MANTLE_DEFAULT_BASE_URL);
    expect(entry!.allowBaseUrlOverride).toBe(true);
    expect(entry!.baseUrlChoices).toEqual(AMAZON_BEDROCK_MANTLE_BASE_URL_CHOICES);
    expect(entry!.note?.toLowerCase()).toContain("amazon q");
    expect(entry!.note?.toLowerCase()).toContain("not");
  });
});
