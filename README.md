# 远征余响

一个中文优先、可独立运行的轻量小队远征游戏。游戏规则不依赖 LLM；宿舍对白等叙事内容可以由 Mobile Tavern 宿主增强，接口不可用时自动回退到本地文案。

## 开发

```bash
npm install
npm run dev
npm test
npm run build
```

## 架构

- `src/domain`：纯 TypeScript 领域模型与规则引擎，不引用 React、浏览器或 LLM。
- `src/content`：职业、角色、敌人和远征节点等静态内容。
- `src/infrastructure`：本地存档与宿主 LLM 适配器。
- `src/ui`：React 页面和交互，只向规则引擎派发动作。

## 设计边界

LLM 只输出可丢弃的表现文本，不允许返回或修改生命、士气、金币、装备、掉落和远征进度。无 LLM、请求失败或 iframe 禁止本地存储时，核心游戏仍然可以正常运行。
