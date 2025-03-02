---
layout: post
title: 配置好MacMini M4
date: 2025-03-02
---

新买的MacMini M4到货了，可以开始配置。

# 包管理策略
手动管理。Homebrew 用起来不太好用。

# ClashXMeta
```
https://github.com/MetaCubeX/ClashX.Meta/releases/download/v1.4.9/ClashX.Meta.zip
```
拉取这个就行。我自己从源码构建失败了，应该是go版本的问题，懒得弄了。

# Rust toolchain
```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

在`~/.cargo/config`写入
```toml
[http]
proxy = "127.0.0.1:7890"

[https]
proxy = "127.0.0.1:7890"
```

# Golang toolchain
```
https://go.dev/dl/go1.24.0.darwin-arm64.pkg
```
配置走国内镜像
```shell
go env -w GOPROXY=https://goproxy.cn
```

# iTerm2
```
https://iterm2.com/downloads/stable/latest
```
之后配置iTerm2自己检查更新即可

# Oh My Zsh
```shell
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

没有代理用这个
```shell
sh -c "$(curl -fsSL https://install.ohmyz.sh/)"
```

# Catppuccin Colors
```shell
git clone git@github.com:catppuccin/iterm
```

# GNU
## GMP
```
curl -O
```

# wget2
wget2需要很多前置的依赖。

首先利用MacOS自带的版本较低的m4来bootstrap一些较低版本的GNU构建工具。
用这些boot好的构建工具，再构建最高版本的m4。
最后用最高版本m4构建最高版本GNU工具。

### 构建低版本的autoconf
```shell
git clone git@github.com:autotools-mirror/autoconf.git
git checkout AUTOCONF-2.61
# release版本是有configure的哦
```



### m4
```shell
git clone git://git.sv.gnu.org/m4
git checkout v1.4.19
```

### autoconf
```shell
git clone git@github.com:autotools-mirror/autoconf.git
git checkout v2.72
```

### automake

### autopoint

### makeinfo

### help2man