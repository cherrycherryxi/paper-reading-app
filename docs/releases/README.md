# 生产版本更新说明

每次通过 `scripts/codex/deploy-prod.sh` 发布到 Prod 时，发布 hook 会自动生成一份 Markdown 更新说明，文件名为：

```text
docs/releases/YYYY-MM-DD-<commit>.md
```

文档固定记录：

- 解决了什么问题
- 新功能与用户体验变化
- 实现范围和变更文件
- 测试与线上验证
- 影响范围和回滚版本

发布前后仍建议人工把「面向用户的变化」改成更自然的产品语言。自动生成负责完整、可追溯，人工补充负责准确、易读。
