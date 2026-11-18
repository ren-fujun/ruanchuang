# 发布模板

本目录只提供试用环境模板，不包含域名、证书或服务器凭据。

## 生成发布候选

```powershell
.\scripts\ops\package-release.ps1 -Tag rc-20261118
```

输出：

```text
release/rc-20261118/
release/zhihui-rc-20261118.zip
```

发布目录包含五端静态资源、服务端源码、运维脚本、锁文件和 SHA-256 校验清单。

## HTTPS

把 `nginx.conf.example` 中五个 `*.example.invalid` 替换为团队提供的真实域名，配置证书后：

```bash
nginx -t
systemctl reload nginx
```

当前未提供服务器、域名和证书，因此不能生成有效二维码，也不能宣称外网试用已开放。

## 数据目录

```text
ZHIHUI_DATA_FILE=/srv/zhihui/data/store.json
ZHIHUI_BACKUP_DIR=/srv/zhihui/backups
```

发布包不包含运行数据。升级时保留外部数据目录和最近一次可恢复备份。
