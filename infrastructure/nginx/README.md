# infrastructure/nginx

生产环境反向代理模板（当前为注释示例，未启用）。

启用步骤（后续阶段）：

1. 将 `nginx.conf` 中的示例取消注释并按实际域名修改
2. 将配置放入 nginx 的 `conf.d/` 或 `sites-enabled/`
3. 重启 nginx 并验证 `/`、`/blog/`、`/api/` 路由

开发环境请直接访问各应用端口，无需 nginx。
