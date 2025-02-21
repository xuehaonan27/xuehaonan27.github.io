---
layout: post
title: Tailscale+Clash分流内网穿透
date: 2025-02-21
---

Tailscale+Clash分流内网穿透

# 起因
假期回家，但仍然需要登录到学校校园网的机器上工作，且学校推荐的pulse secure工具不是很好用。

# Tailscale配置
由于在本机（MacOS）的tailscale似乎无法作为一个用户态socks5代理服务器运行（Linux上的就可以），因此打算在校园网内某一个Linux机器上运行这样一个tailscale机器，将本地所有到校园网流量，用过Clash规则转发到Linux机器的 **Tailscale IP地址**。

在远端机器上配置
```shell
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.conf
sysctl -p
tailscale up --accept-routes --advertise-routes=<SUBNET_1>,<SUBNET_2>,...
```

https://login.tailscale.com/admin/machines 来批准子网路由。

然后要启动一个dante server来作为socks5服务器。

下面那个配置文件里面<本地机器TSIP地址>指的是本地计算机的Tailscale IP。
需要是CIDR，所以弄一个/32就行
```
# /etc/danted.conf
logoutput: syslog stdout /var/log/sockd.log

internal: 0.0.0.0 port = 1055
external: tailscale0

socksmethod: username none #rfc931
clientmethod: none

#user.privileged: sockd
user.unprivileged: dante_user

client pass {
        from: <本地机器TSIP地址> port 1-65535 to: 0.0.0.0/0
        clientmethod: none
}

client block {
        from: 0.0.0.0/0 to: 0.0.0.0/0
        log: connect error
}

socks block {
        from: 0.0.0.0/0 to: lo0
        log: connect error
}

socks pass {
        from: <本地机器TSIP地址> to: 0.0.0.0/0
        protocol: tcp udp
}
```
然后
```shell
sudo systemctl start danted
sudo systemctl enable danted
```

# 本地Clash分流
启动tailscale
```shell
sudo tailscale up
tailscale ping <TS_IP>
```

Clash规则添加脚本。用于将到校园网的流量按规则走tailscale的虚拟网络接口进入tailscale网络。
实际上Clash Premium好像有这样的内置功能，但是懒得搞那个开源的项目了，手搓一个Python脚本也不麻烦。

```python
#! /usr/bin/env python3
import yaml
import sys
import os

TAILSCALE_ENTRY_MACHINE_TS_IP = ... # 入口Linux机器的Tailscale IP地址
TAILSCALE_ENTRY_MACHINE_ADVERTISED_SUBNET = ... # 入口Linux机器广播的IP子网

TAILSCALE_PROXY = {
    "name": "Tailscale",
    "type": "socks5",
    "server": TAILSCALE_ENTRY_MACHINE_TS_IP,
    "port": "1055",
    "udp": True,
}

CAMPUS_RULES = [
    ["DOMAIN-SUFFIX", "pku.edu.cn", "CAMPUS"],
    ["DOMAIN-SUFFIX", "lcpu.dev", "CAMPUS"],
    ["IP-CIDR", TAILSCALE_ENTRY_MACHINE_ADVERTISED_SUBNET, "CAMPUS"]
]


def modify_clash_config(config_path: str):
    # Backup original file
    os.system(f"cp {config_path} {config_path}.bak")

    # Load YAML config
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f) or None

    if not config:
        print(f"Fail to load {config_path}")
        return

    # Insert proxy node
    if 'proxies' not in config:
        config['proxies'] = []
    if not any(p['name'] == TAILSCALE_PROXY['name'] for p in config['proxies']):
        config['proxies'].insert(0, TAILSCALE_PROXY)

    # Insert proxy group
    if 'proxy-groups' not in config:
        config['proxy-groups'] = []
    campus_group = next(
        (g for g in config['proxy-groups'] if g['name'] == 'CAMPUS'),
        None
    )

    if not campus_group:
        campus_group = {
            "name": "CAMPUS",
            "type": "select",
            "proxies": [TAILSCALE_PROXY['name'], "DIRECT"]
        }
        config['proxy-groups'].insert(0, campus_group)
    else:
        if TAILSCALE_PROXY['name'] not in campus_group['proxies']:
            campus_group['proxies'].insert(0, TAILSCALE_PROXY['name'])

    if 'rules' not in config:
        config['rules'] = []

    # Delete possible existing rules
    config['rules'] = [r for r in config['rules']
                       if not (isinstance(r, str) and
                               (r.startswith("DOMAIN-SUFFIX,pku.edu.cn") or
                               r.startswith("DOMAIN-SUFFIX,lcpu.dev") or
                               r.startswith("IP-CIDR,"+TAILSCALE_ENTRY_MACHINE_ADVERTISED_SUBNET)))]

    # Insert new rule
    config['rules'] = [
        f"{rule[0]},{rule[1]},{rule[2]}" for rule in CAMPUS_RULES] + config['rules']

    with open(config_path, 'w') as f:
        yaml.dump(config, f, allow_unicode=True, sort_keys=False)

    print(f"Successfully modified {config_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <config.yaml>")
        print(f"You probably want to use this:")
        print()
        print(f"python3 {sys.argv[0]} \"<path_to_this_script>\"")
        sys.exit(1)
    modify_clash_config(sys.argv[1])
```

# Tips
需要本地`sudo tailscale ping <LinuxMachineTSIP>`来打洞。
