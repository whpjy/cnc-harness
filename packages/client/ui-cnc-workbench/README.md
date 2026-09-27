---
description: "CNC engineering workbench for Harness sessions."
kind: "package-reference"
---

# @seksun/dsh-client-ui-cnc-workbench

English | [中文](README.zh.md)

## Summary

Adds compact, business-readable views for CNC MCP calls and a right-side engineering workspace. A completed CNC tool call can open the matching job without exposing raw JSON in the conversation.

## Use this package

Mount the client plugin after the standard Tool and right-Sidebar plugins. CNC job pages default to `http://127.0.0.1:3001`; set the browser-local `cnc.baseUrl` value to use another CNC frontend origin.

## Model Experience

None. The plugin only presents durable tool calls already recorded by Harness and does not add prompts, tools, messages, or token usage.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

The first version embeds the existing CNC job page. A future CNC renderer API can replace the iframe while preserving this plugin's tool and workspace contracts.
