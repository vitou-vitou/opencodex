---
title: プロキシ比較
description: LiteLLM・Claude Code Router・go-llm-proxy と比べて、いつ opencodex を選ぶか。
---

opencodex は **OpenAI Codex と Claude Code 向けのローカルプロバイダプロキシ**です — マルチプロバイダ
ルーティング、ChatGPT アカウントプール、Responses/Anthropic ブリッジにより、本来想定されていないモデルを
それらのクライアントで使えます。**汎用エンタープライズ LLM ゲートウェイ**でも、**マルチエージェント
オーケストレーションのコントロールプレーン**でもありません。

近くのツールは別の仕事をします。星の数ではなく **役割** で選んでください。

:::note[Star スナップショット]
2026-07-30 時点の概算 GitHub stars: [LiteLLM](https://github.com/BerriAI/litellm) ~55k、
[Claude Code Router](https://github.com/musistudio/claude-code-router) ~36k、
[opencodex](https://github.com/lidge-jun/opencodex) ~5.9k、
[go-llm-proxy](https://github.com/yatesdr/go-llm-proxy) ニッチ。Stars は人気であり適合度ではありません。
:::

## すばやく選ぶ

| 選ぶ… | こんなとき |
| --- | --- |
| **opencodex** | Codex CLI/App/SDK および/または Claude Code が多プロバイダと話し、ローカルダッシュボードと Codex アカウントプールが欲しい |
| **LiteLLM** | アプリ/バックエンド向け組織 API ゲートウェイ（100+ プロバイダ、コスト、ガードレール、LB） |
| **Claude Code Router (CCR)** | エージェントをモデル間でルーティングし能力を融合・ツールをオーケストレーションするローカル制御面 |
| **go-llm-proxy** | プロトコル変換 + ビジョン説明・OCR/PDF・Web 検索などの能力注入 |

## opencodex

**役割:** Codex と Claude Code が任意の LLM プロバイダを 1 つの Bun ネイティブロカルプロキシ経由で使う。

**opencodex を選ぶとき:**

- Codex および/または Claude Code で Claude、Gemini、Grok、DeepSeek、Ollama、OpenRouter などを使いたい
- Codex ChatGPT **アカウントプール**親和性、クォータに基づく選択、opencodex Web ダッシュボードが重要
- 組織ゲートウェイなしで Responses ↔ プロバイダアダプタが欲しい

**向かない場合:** 社内サービス群の集中マルチテナントコスト統治（LiteLLM 向き）。専用オーケストレーション
コントロールプレーンが必要なエージェント群（CCR 向き）。

[仕組み](/ja/getting-started/how-it-works/)、[プロバイダー](/ja/guides/providers/)、
[Claude Code](/ja/guides/claude-code/) を参照。

## LiteLLM

**役割:** 組織 / マルチプロバイダ **API ゲートウェイ**（[BerriAI/litellm](https://github.com/BerriAI/litellm)）。

**LiteLLM を選ぶとき:** 予算・キー・可観測性つきのゲートウェイがアプリ/チームに必要；Bedrock、Azure、Vertex、
vLLM などを OpenAI 形で標準化したい。

**代わりに opencodex:** 主クライアントが Codex / Claude Code で、ネイティブ UX とアカウントプールが必要で
エンタープライズゲートウェイではないとき。

## Claude Code Router (CCR)

**役割:** ローカル **マルチエージェント制御面**
（[musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)）。

**CCR を選ぶとき:** 痛みが「Codex を別プロバイダに向ける」ではなく **エージェントのルーティングと
オーケストレーション**のとき。

**代わりに opencodex:** Codex/Claude Code の **プロバイダプロキシ**（アダプタ、プール、ダッシュボード）が
必要なとき。

## go-llm-proxy

**役割:** プロトコル橋渡しと **能力注入**の軽量 Go プロキシ
（[yatesdr/go-llm-proxy](https://github.com/yatesdr/go-llm-proxy)）— ビジョン説明、PDF/OCR、Web 検索。

**go-llm-proxy を選ぶとき:** ローカル/セキュアなバックエンドにビジョン・PDF・検索がなくプロキシで
透過的に埋めたい；または vLLM/Bedrock/混在バックエンド前のプロトコル変換が主目的。

**代わりに opencodex:** Codex/Claude Code 中心のレジストリ、アカウントプール、ダッシュボードが欲しいとき。
opencodex にも [サイドカー](/ja/guides/sidecars/) がありますが製品の焦点は異なります。

## マルチアカウント: 二つの異なる仕事

「複数の Codex アカウント」はだいたい次のどちらかです。混同しないでください。

| 仕事 | パターン | 例 |
| --- | --- | --- |
| **並列フリート** | N アカウント × N 並列エージェント | Star Fleet 風ハーネス（並列エージェントごとにアカウント） |
| **クォータプール** | アクティブな Codex 経路は 1 本；429 / クォータで切替 + thread affinity | opencodex Codex Auth；`codex-rotate` のようなローカル `auth.json` ローテーター |

opencodex が実装するのは **クォータプール**です。既存スレッドは 1 アカウントに留まり、新規セッションは
使用量・クールダウン・健全性で再配分できます。並列マルチアカウントのオーケストレータではありません。

## 近くのツール

[1rgs/claude-code-proxy](https://github.com/1rgs/claude-code-proxy)（~3.7k）は Claude Code を
OpenAI 形モデルで動かすことに焦点があります。重なりはありますが、opencodex は同じローカルプロキシで
**Codex**（Responses API、アカウントプール、マルチプロバイダレジストリ）も扱います。
