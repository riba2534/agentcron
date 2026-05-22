export interface ErrorMessage {
  title: string;
  hint?: string;
  cta?: string;
}

export const errorMessages: Record<string, ErrorMessage> = {
  CCT_AUTH_EMAIL_TAKEN: { title: '该邮箱已被注册', hint: '换一个邮箱或试试登录' },
  CCT_AUTH_WEAK_PASSWORD: { title: '密码强度不足', hint: '至少 12 位，建议混合大小写、数字与符号' },
  CCT_AUTH_INVALID_CREDENTIALS: { title: '邮箱或密码错误' },
  CCT_AUTH_SESSION_MISSING: { title: '登录已过期', cta: '重新登录' },
  CCT_AUTH_SESSION_EXPIRED: { title: '登录已过期', cta: '重新登录' },
  CCT_AUTH_RATE_LIMIT: { title: '尝试次数过多', hint: '请稍候再试' },

  CCT_TASK_NOT_FOUND: { title: '任务不存在或已删除' },
  CCT_TASK_DUPLICATE_NAME: { title: '任务名已存在', hint: '换一个不同的名字' },
  CCT_TASK_INVALID_CRON: { title: 'Cron 表达式无效', hint: '需要 5 字段标准 cron，例如 "0 9 * * *"' },
  CCT_TASK_DISABLED: { title: '任务已停用', hint: '先启用再尝试操作' },
  CCT_TASK_ARCHIVED: { title: '任务已归档', hint: '已归档任务不可修改' },
  CCT_TASK_INVALID_TIMEZONE: { title: '时区无效', hint: '请选择 IANA 时区，例如 Asia/Shanghai' },
  CCT_TASK_TIMEOUT_OUT_OF_RANGE: { title: '超时设置超出允许范围', hint: '建议 30 秒到 60 分钟之间' },
  CCT_TASK_BUDGET_INVALID: { title: '预算金额无效', hint: '请填写大于 0 的金额' },

  CCT_CLARIFY_NOT_FOUND: { title: '澄清会话不存在' },
  CCT_CLARIFY_NOT_READY: { title: '澄清还没准备好', hint: '继续回答问题，AI 会给出最终方案' },
  CCT_CLARIFY_ALREADY_COMPLETED: { title: '澄清已完成', hint: '请回到任务列表查看' },
  CCT_CLARIFY_MODEL_UNAVAILABLE: { title: '所选模型暂时不可用', cta: '换个模型' },
  CCT_CLARIFY_TIMEOUT: { title: '澄清超时', cta: '重试' },
  CCT_CLARIFY_INTERNAL: { title: '澄清内部错误', cta: '查看 doctor' },

  CCT_SCHEDULER_BOOTSTRAP_FAILED: {
    title: '调度记录写入失败',
    hint: 'launchd 拒绝加载',
    cta: '查看系统状态',
  },
  CCT_SCHEDULER_CRONTAB_WRITE_FAILED: {
    title: '写入 crontab 失败',
    hint: '可能是文件权限问题，请查看 doctor',
    cta: '查看系统状态',
  },
  CCT_SCHEDULER_CRON_TOO_DENSE: { title: 'Cron 太密', hint: '建议至少 1 分钟一次' },
  CCT_SCHEDULER_LOCK_TIMEOUT: { title: '调度锁忙', hint: '请稍候重试' },
  CCT_SCHEDULER_SYNC_FAILED: { title: '同步失败', cta: '一键修复' },
  CCT_SCHEDULER_UNSUPPORTED_PLATFORM: { title: '当前系统暂不支持', hint: '仅支持 macOS / Linux' },

  CCT_RUNNER_TASK_NOT_FOUND: { title: '执行的任务不存在' },
  CCT_RUNNER_SPAWN_FAILED: { title: '执行失败', hint: '无法 spawn claude 进程' },
  CCT_RUNNER_TIMEOUT: { title: '执行超时', hint: '考虑放宽超时上限' },
  CCT_RUNNER_LOCK_BUSY: { title: '上一轮还在跑', hint: '稍后再试' },
  CCT_RUNNER_DECRYPT_FAILED: { title: '解密 token 失败', cta: '更新模型 token' },
  CCT_RUNNER_DB_UNAVAILABLE: { title: '数据库暂不可用', cta: '查看 doctor' },
  CCT_RUNNER_LOG_WRITE_FAILED: { title: '写日志失败', hint: '查看磁盘是否已满' },
  CCT_RUNNER_BUDGET_EXCEEDED: { title: '预算超限,任务被跳过', cta: '调整预算' },

  CCT_MODEL_NOT_FOUND: { title: '模型不存在' },
  CCT_MODEL_ALIAS_TAKEN: { title: 'alias 已被占用', hint: '换一个 alias' },
  CCT_MODEL_INVALID_URL: { title: 'base_url 不合法', hint: '需要 https:// 开头' },
  CCT_MODEL_IN_USE: { title: '此模型仍有任务在用', hint: '先把任务改其他模型再删' },
  CCT_MODEL_TEST_FAILED: { title: '测试请求失败', hint: '检查 base_url 与 token' },

  CCT_RUN_NOT_FOUND: { title: '执行记录不存在' },
  CCT_RUN_LOG_MISSING: { title: '日志文件不存在或已被清理' },

  CCT_DOCTOR_RUN_FAILED: { title: '系统检查失败', cta: '终端运行 cct-doctor' },
  CCT_DOCTOR_TCC_BLOCKED: {
    title: '系统拦截了任务执行',
    hint: '看起来是 macOS TCC',
    cta: '查看修复指引',
  },

  CCT_SECRETS_KEYCHAIN_UNAVAILABLE: { title: '钥匙串不可用', cta: '查看 doctor' },
  CCT_SECRETS_DECRYPT_FAILED: { title: 'Token 解密失败', cta: '重新输入 token' },
  CCT_SECRETS_UNKNOWN_VERSION: { title: '密钥版本不一致', hint: '请联系管理员' },
  CCT_SECRETS_MASTER_KEY_MISSING: { title: '主密钥缺失', cta: '查看 doctor' },

  CCT_PROMPT_SUSPICIOUS_INJECTION: { title: 'Prompt 触发了安全检查', hint: '请删除可疑指令再试' },

  CCT_SSE_RECONNECT_FAILED: { title: '重连失败', cta: '点击重试' },
  CCT_NETWORK_ERROR: { title: '网络异常', hint: '请检查网络连接后重试' },
  CCT_UNKNOWN: { title: '未知错误', hint: '稍后再试或查看系统状态' },
};

export function describe(code: string | undefined | null): ErrorMessage {
  if (!code) return errorMessages.CCT_UNKNOWN!;
  return errorMessages[code] ?? { title: '未知错误', hint: code };
}
