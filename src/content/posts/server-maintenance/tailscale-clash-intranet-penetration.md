---
title: "Intranet Penetration by Tailscale and Clash"
pubDatetime: 2025-10-09T20:33:41+08:00
description: "I was home in holiday and sometimes need to log onto servers in campus net. However VPN tool suggested by university (Pulse Secure) is inconvenient."
tags:
  - server-maintenance
---

## Background
I was home in holiday and sometimes need to log onto servers in campus net. However VPN tool suggested by university (`Pulse Secure`) is inconvenient.

## Reference
My friend's blog [here](https://arthals.ink/blog/pku-vpn-internal-server).

## Tailscale setup
On my personal computer (MacOS), tailscale could not run as a user space socks5 proxy server (Linux one could do so, though), so I want to run a tailscale user space proxy server on a Linux server in campus network, and route all traffic to campus network via clash to that Linux server.

On remote server (Linux):
```shell
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.conf
sysctl -p
tailscale up --accept-routes --advertise-routes=<SUBNET_1>,<SUBNET_2>,...
```

Access tailscale dashboard (https://login.tailscale.com/admin/machines) and approve subnet routes.

## Dante as socks5 server
`<Local Machine TSIP>` means Tailscale IP of my own personal computer. CIDR needed so `/32` is good.

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

And then:
```shell
sudo systemctl start danted
sudo systemctl enable danted
```

## Clash redirect traffic to remote server
Start tailscale.
```shell
sudo tailscale up
tailscale ping <TS_IP>
```

Add Clash rules. The traffic to campus network will be redirected by Clash according to the rule, to the Tailscale virtual network interface into tailscale network.

Actually `Clash Premium` might have script modification functions, but I am too lazy to install another software, especially when that's an opensource one and need build on my own. Write a Python script is not that boring though!


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

## Tips
Run this to get a hole!
```shell
sudo tailscale ping <LinuxMachineTSIP>
```
