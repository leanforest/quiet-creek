# 项目约定

- 本项目是“溪间小筑 · Quiet Creek”，使用 Three.js、Vite 和原生 JavaScript ES Modules。详细运行说明见 `README.md`。
- 沟通、变更说明和 Git 提交信息使用中文；提交信息简短说明实际改动。

## 代码与资源

- `src/main.js`：场景组装、相机与交互；`water.js`、`landscape.js`、`atmosphere.js`、`lens.js`、`audio.js` 各自负责对应功能。
- 界面在 `src/ui.js` 与 `src/style.css`；运行时静态资源在 `public/`。
- 木屋模型生成脚本为 `scripts/build_cottage.py`，Blender 源文件为 `assets/cottage.blend`，导出模型为 `public/models/cottage.glb`。修改模型时保持相关源文件与导出资源一致。
- `reference/` 用于视觉核对；`dist/`、`output/`、`node_modules/` 和 `.playwright-cli/` 不提交。

## 修改原则

- 遵循现有代码风格与模块职责，保持改动聚焦，避免无关重构和不必要的新依赖。
- 保持固定 16:9 横屏构图；竖屏采用上下留边，不裁切或拉伸场景。
- 模型、纹理和声音保持本地可用；新增第三方素材时同步更新根目录及 `public/` 中的 `THIRD_PARTY_NOTICES.md`。
- 场景修改注意绘制调用和每帧开销，保留植被实例化与渲染品质设置。

## 运行与验证

- 安装依赖：`npm install`；开发预览：`npm run dev`；生产构建：`npm run build`；构建预览：`npm run preview`。
- 代码或资源修改后运行 `npm run build`。视觉或交互修改还需在浏览器检查相关功能、控制台错误及桌面和手机横竖屏表现。
- 当前没有自动化测试命令；不要将构建通过等同于浏览器验证通过。交付时简述改动、实际验证结果及未验证项。
- 仅修改文档时，核对内容、路径和命令即可，无需构建。
