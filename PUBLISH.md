# 发布说明

这个 `site` 目录已经是纯静态网站，可以直接部署。

## 方案 1：GitHub Pages

适合长期托管、可版本管理。

1. 新建一个 GitHub 仓库。
2. 把 `site` 目录里的内容上传到仓库根目录，或者放到 `docs/` 目录。
3. 在仓库设置中打开 Pages，选择对应分支和目录。

官方文档：
- [GitHub Pages Quickstart](https://docs.github.com/pages/quickstart)

## 方案 2：Netlify

适合最快拿到一个公网地址。

1. 打开 Netlify。
2. 选择手动部署静态站点。
3. 直接上传整个 `site` 文件夹，或上传 `site.zip`。

官方文档：
- [Netlify deploy overview](https://docs.netlify.com/deploy/deploy-overview)
- [Netlify create deploys](https://docs.netlify.com/site-deploys/create-deploys/)

## 方案 3：Cloudflare Pages

适合后面要接自定义域名。

1. 打开 Cloudflare Pages。
2. 创建一个静态站点项目。
3. 上传 `site` 文件夹，或使用仓库接入。

官方文档：
- [Cloudflare Pages: deploy static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [Cloudflare Pages how-to](https://developers.cloudflare.com/pages/how-to)

## 当前目录建议

- 直接用于上传：`site/`
- 便于拖拽上传：`site.zip`
