---
description: "Harness 会话中的 CNC 工程工作台。"
kind: "package-reference"
---

# @seksun/dsh-client-ui-cnc-workbench

[English](README.md) | 中文

## 概述

该插件把 CNC MCP 工具调用显示为适合工程人员阅读的过程卡片，并在 Harness
右侧提供模型、特征、工序、刀路和仿真工作区。工具执行完成后，可以直接打开
对应任务现场，不需要在对话中展开原始 JSON。

## 使用方式

插件应加载在标准工具视图和右侧栏插件之后。CNC 页面默认使用
`http://127.0.0.1:3001`；如需连接其他前端地址，可在浏览器本地存储中设置
`cnc.baseUrl`。

## 模型体验

无额外影响。插件只负责呈现 Harness 已记录的持久化工具调用，不添加提示词、
工具、消息或 token 消耗。

#### KV Cache 影响

无。

## 已知限制与后续工作

当前版本在右侧工作区嵌入现有 CNC 任务页面。后续可接入专用 CNC 渲染接口，
并继续复用本插件的工具卡片和工作区协议。
