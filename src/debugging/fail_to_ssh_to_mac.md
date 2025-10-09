# Fail to SSH log onto a MacOS server
Date: 2025-03-02
Error when SSH onto a MacOS error:
```plaintext
kex_exchange_identification: read: Connection reset by peer
Connection reset by <My IP Address...> port 22
```

## Background
This server is connected via `tailscale` network and SSH login is enabled.

## Solving
First try checking the log.
```shell
sudo log stream --predicate 'process == "sshd"' --info
```
Got these log information on my server:
```plaintext
Timestamp                       Thread     Type        Activity             PID    TTL
2025-03-02 23:07:56.155362+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.155878+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.155900+0800 0x15e23a   Error       0x0                  44960  0    sshd: (libsystem_info.dylib) [com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument
2025-03-02 23:07:56.157492+0800 0x15e23a   Info        0x0                  44960  0    sshd: sshd: no hostkeys available -- exiting.
```
It turns out that `tailscale` is wrongly set. `Allow Local Network Access` should be enabled!
