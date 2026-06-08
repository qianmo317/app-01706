# 批量去水印工具 - 前端用户端
# 基础镜像选用官方 nginx alpine，支持 linux/amd64 和 linux/arm64
FROM --platform=$BUILDPLATFORM nginx:1.25-alpine AS builder

# 复制静态资源到 nginx 默认目录
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY libs/ /usr/share/nginx/html/libs/

# 自定义 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 最终运行镜像
FROM nginx:1.25-alpine

COPY --from=builder /usr/share/nginx/html /usr/share/nginx/html
COPY --from=builder /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
