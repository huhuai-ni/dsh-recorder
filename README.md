# dsh-recorder

DSH 插件：**全局热键录屏**，用 ffmpeg 抓屏存 MP4。

## 功能

- 快捷键开始 / 结束（默认 `Ctrl+Alt+R`）
- 录制整屏，H.264 MP4
- 帧率、画质（CRF）、保存目录都可改
- 设置页有状态（录制中/空闲 + 计时）和录像列表
- 工具：`rec_start` / `rec_stop` / `rec_status` / `rec_list`

## 安装

```bash
dsh plugin --profile desktop add dsh-recorder
```

需要 **ffmpeg** 在 PATH 里（没有就装：`winget install Gyan.FFmpeg`），或在设置里填 ffmpeg 的完整路径。

## 原理

- 后端 spawn `ffmpeg -f gdigrab -i desktop -c:v libx264 ... out.mp4`
- 停止时往 ffmpeg 的 stdin 写 `q`，让它**正常收尾写文件**（直接 kill 会得到坏文件）
- 全局热键由 `scripts/hotkey.ps1` 里的 C# 注册，按下后**往 trigger.txt 追加一行**；插件每 400ms 看一眼文件变化，切换录制状态

## 限制

- Windows 专用（gdigrab）
- 只录画面，**不录声音**（系统声音要额外走 WASAPI loopback，后续可加）
- 只录整屏，没有框选区域