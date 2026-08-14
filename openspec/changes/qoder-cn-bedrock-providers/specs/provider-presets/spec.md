## ADDED Requirements

### Requirement: Qoder CN Coding Plan China preset

The provider registry MUST include a key-auth preset for Qoder CN / Alibaba Coding Plan (China) whose default OpenAI-compatible base URL is `https://coding.dashscope.aliyuncs.com/v1`.

#### Scenario: Registry exposes qoder-cn

- **WHEN** the provider registry is loaded
- **THEN** an entry with id `qoder-cn` exists
- **AND** its `baseUrl` is `https://coding.dashscope.aliyuncs.com/v1`
- **AND** its `adapter` is `openai-chat`
- **AND** its `authKind` is `key`

#### Scenario: International Coding Plan remains distinct

- **WHEN** the provider registry is loaded
- **THEN** entry `alibaba` still uses `https://coding-intl.dashscope.aliyuncs.com/v1`
- **AND** its label or note identifies it as International (not China)

### Requirement: Amazon Bedrock Mantle preset

The provider registry MUST include a key-auth OpenAI-compatible Amazon Bedrock Mantle preset. It MUST NOT claim to be the JetBrains Amazon Q Agent product.

#### Scenario: Registry exposes amazon-bedrock

- **WHEN** the provider registry is loaded
- **THEN** an entry with id `amazon-bedrock` exists
- **AND** its default `baseUrl` targets `bedrock-mantle` under `api.aws` with an `/v1` suffix
- **AND** its `adapter` is `openai-chat`
- **AND** its `authKind` is `key`
- **AND** its note distinguishes Bedrock Mantle from the Amazon Q IDE/agent surface
