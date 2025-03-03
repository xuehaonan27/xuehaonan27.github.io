---
layout: post
title: 登录到MacOS服务器时出现错误
date: 2025-03-02
---

登录到MacOS服务器时出现错误，提示kex_exchange_identification: read: Connection reset by peer
Connection reset by 100.127.242.56 port 22

# 解决方法
sudo log stream --predicate 'process == "sshd"' --info
运行后，尝试连接，在server上捕捉到以下日志信息
```
Timestamp                       Thread     Type        Activity             PID    TTL
2025-03-02 23:07:56.155362+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.155878+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.155900+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.157492+0800 0x15e23a   Info        0x0                  44960  0    sshd: sshd: no hostkeys available -- exiting.
```

tailscale 打开 Allow Local Network Access.