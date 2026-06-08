# 批量去水印工具

## How to Run

```bash
# 一键构建并启动
docker-compose up --build -d

# 停止服务
docker-compose down
```

## Services

| 服务 | 目录 | 端口 | 说明 |
|------|------|------|------|
| frontend-user | `frontend-user/` | 8081 | 用户端（批量去水印工具页面） |

访问地址：http://localhost:8081

## 测试账号

本项目为纯前端工具，无需登录，无测试账号。

## 题目内容

使用一个html生成一个批量去水印工具，可以一键导入多张图片，可以选取图片中水印的位置，精确去水印，可以批量下载图片，可以导出所有图片为pdf，标题写“批量去水印工具”，背景使用马克龙渐变颜色，可以自己切换背景。

## 项目介绍

一个基于纯前端技术实现的批量图片去水印工具，无需后端服务，所有处理在浏览器本地完成。

### 核心功能

- **批量导入** - 支持一次选择多张图片
- **精确框选** - 在 Canvas 上拖动鼠标框选水印区域，支持多区域选择
- **4种去水印算法** - Telea 快速行进修复、NS 扩散修复、高斯模糊填充、周围像素平均
- **Web Worker** - 算法在后台线程执行，不阻塞 UI
- **批量下载** - 一键下载所有处理后的图片
- **导出 PDF** - 将所有图片导出为一个 PDF 文件（jsPDF 本地化引入）
- **马卡龙主题** - 5 种马卡龙渐变背景可切换

### 项目结构

```
├── frontend-user/              # 用户端（纯前端静态项目）
│   ├── index.html              # HTML 结构
│   ├── css/style.css           # 样式
│   ├── js/app.js               # 主逻辑（UI、事件、状态管理）
│   ├── js/inpaint-worker.js    # Web Worker（去水印算法）
│   ├── libs/jspdf.umd.min.js   # 本地化 jsPDF 依赖
│   ├── nginx.conf              # Nginx 配置
│   └── Dockerfile              # Docker 构建文件（nginx:1.25-alpine，跨平台）
├── docker-compose.yml          # Docker Compose 编排
├── .gitignore                  # Git 忽略规则
├── README.md                   # 项目说明
└── 轨迹/                       # 开发轨迹记录
```

### 技术栈

- HTML5 Canvas + 原生 JavaScript
- Web Worker（后台线程算法执行）
- jsPDF（PDF 导出，本地引入）
- Nginx 1.25 Alpine（Docker 部署）
